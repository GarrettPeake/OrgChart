import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	vi,
	type MockedFunction,
} from 'vitest';
import {ContinuousContextManager} from '@/server/workflows/ContinuousContext.js';
import {GitIgnoreParser} from '@/server/utils/GitIgnoreParser.js';
import {getConfig} from '@/server/utils/Configuration.js';
import {startFileWatching} from '@/server/utils/FileSystemUtils.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import Logger from '@/Logger.js';

// Mock dependencies
vi.mock('@/Logger.js', () => ({
	default: {
		info: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock('@/server/utils/Configuration.js', () => ({
	getConfig: vi.fn(),
}));

vi.mock('@/server/utils/FileSystemUtils.js', async importOriginal => {
	const original = await importOriginal<
		typeof import('@/server/utils/FileSystemUtils.js')
	>();
	return {
		...original,
		startFileWatching: vi.fn(),
		getFormattedContext: vi
			.fn()
			.mockResolvedValue('# Test Project\n\nSample content'),
	};
});

// Mock LLM Provider
const mockLLMProvider = {
	chatCompletion: vi.fn(),
};

describe('ContinuousContextManager', () => {
	let manager: ContinuousContextManager;
	let testDir: string;
	let mockConfig: any;
	let mockUnsubscribe: () => void;

	const createTestFile = async (filePath: string, content = '') => {
		const fullPath = path.join(testDir, filePath);
		await fs.mkdir(path.dirname(fullPath), {recursive: true});
		await fs.writeFile(fullPath, content);
	};

	beforeEach(async () => {
		vi.clearAllMocks();

		// Create temporary directory
		testDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'continuous-context-test-'),
		);

		// Setup mock unsubscribe function
		mockUnsubscribe = vi.fn();

		// Setup mock config
		mockConfig = {
			rootDir: testDir,
			orgChartDir: path.join(testDir, '.orgchart'),
			projectContextFile: path.join(testDir, '.orgchart', 'PROJECT.md'),
			ignorePatterns: ['node_modules'],
			llmProvider: mockLLMProvider,
		};

		(getConfig as MockedFunction<typeof getConfig>).mockReturnValue(mockConfig);
		(
			startFileWatching as MockedFunction<typeof startFileWatching>
		).mockResolvedValue(mockUnsubscribe);

		// Setup directories
		await fs.mkdir(mockConfig.orgChartDir, {recursive: true});

		// Setup LLM mock response
		mockLLMProvider.chatCompletion.mockResolvedValue({
			choices: [
				{
					message: {
						content: '# Generated Context\n\nThis is a test context document.',
					},
				},
			],
		});

		manager = new ContinuousContextManager();
	});

	afterEach(async () => {
		if (manager) {
			manager.destroy();
		}
		await fs.rm(testDir, {recursive: true, force: true});
	});

	describe('initialization', () => {
		it('should initialize without auto-starting', () => {
			expect(startFileWatching).not.toHaveBeenCalled();
			expect(mockLLMProvider.chatCompletion).not.toHaveBeenCalled();
		});

		it('should initialize and create initial context', async () => {
			await manager.initialize();

			expect(mockLLMProvider.chatCompletion).toHaveBeenCalledWith(
				expect.objectContaining({
					model: 'openai/gpt-oss-120b',
					messages: expect.arrayContaining([
						expect.objectContaining({
							role: 'system',
							content: expect.stringContaining(
								'You must maintain a single document',
							),
						}),
						expect.objectContaining({
							role: 'user',
							content: '# Test Project\n\nSample content',
						}),
					]),
					temperature: 0.2,
					stream: false,
				}),
				[],
			);

			// Check that context file was written
			const contextContent = await fs.readFile(
				mockConfig.projectContextFile,
				'utf8',
			);
			expect(contextContent).toBe(
				'# Generated Context\n\nThis is a test context document.',
			);

			// Check that FULL_CONTEXT.md was written
			const fullContextPath = path.join(
				mockConfig.orgChartDir,
				'FULL_CONTEXT.md',
			);
			const fullContextExists = await fs
				.access(fullContextPath)
				.then(() => true)
				.catch(() => false);
			expect(fullContextExists).toBe(true);

			// Check that file watching was started
			expect(startFileWatching).toHaveBeenCalledWith(
				testDir,
				expect.any(Function),
				expect.any(GitIgnoreParser),
			);
		});

		it('should handle LLM errors gracefully', async () => {
			mockLLMProvider.chatCompletion.mockRejectedValue(new Error('API Error'));

			await manager.initialize();

			expect(Logger.error).toHaveBeenCalledWith(
				'Error creating initial context:',
				expect.any(Error),
			);
		});

		it('should handle LLM response without message', async () => {
			mockLLMProvider.chatCompletion.mockResolvedValue({
				choices: [{}],
			});

			await manager.initialize();

			expect(Logger.info).toHaveBeenCalledWith(
				expect.stringContaining(
					'No message received from LLM for continuous context',
				),
			);
		});
	});

	describe('file mutation tracking', () => {
		let fileWatchingCallback: (event: any) => Promise<void>;

		beforeEach(async () => {
			await manager.initialize();

			// Get the callback from the startFileWatching mock call
			const mockCalls = (
				startFileWatching as MockedFunction<typeof startFileWatching>
			).mock.calls;
			expect(mockCalls).toHaveLength(1);
			fileWatchingCallback = mockCalls[0]![1];

			vi.clearAllMocks();
		});

		it('should track file creation events', async () => {
			await createTestFile('test.txt', 'Hello World');

			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'test.txt'),
			});

			// Generate mutation document to verify tracking
			const mutationDoc = (manager as any).generateMutationDocument();
			expect(mutationDoc).toContain(
				'# File mutations since last document update',
			);
			expect(mutationDoc).toContain('## test.txt - CREATED');
			expect(mutationDoc).toContain('Hello World');
		});

		it('should track file update events', async () => {
			await createTestFile('test.txt', 'Original Content');

			// Simulate initial creation
			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'test.txt'),
			});

			// Update the file
			await fs.writeFile(path.join(testDir, 'test.txt'), 'Updated Content');

			// Simulate update event
			await fileWatchingCallback({
				type: 'update',
				path: path.join(testDir, 'test.txt'),
			});

			const mutationDoc = (manager as any).generateMutationDocument();
			expect(mutationDoc).toContain('## test.txt - UPDATED');
			expect(mutationDoc).toContain('### Previous content');
			expect(mutationDoc).toContain('Original Content');
			expect(mutationDoc).toContain('### New content');
			expect(mutationDoc).toContain('Updated Content');
		});

		it('should track file deletion events', async () => {
			await createTestFile('test.txt', 'Content to be deleted');

			// Simulate creation first
			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'test.txt'),
			});

			// Simulate deletion
			await fileWatchingCallback({
				type: 'delete',
				path: path.join(testDir, 'test.txt'),
			});

			const mutationDoc = (manager as any).generateMutationDocument();
			expect(mutationDoc).toContain('## test.txt - DELETED');
			expect(mutationDoc).toContain('Content to be deleted');
		});

		it('should handle file events with read errors gracefully', async () => {
			// Simulate event for non-existent file
			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'non-existent.txt'),
			});

			expect(Logger.error).toHaveBeenCalledWith(
				expect.stringContaining(
					'Error handling file event for non-existent.txt:',
				),
				expect.any(Error),
			);
		});

		it('should generate empty mutation document when no changes', () => {
			const mutationDoc = (manager as any).generateMutationDocument();
			expect(mutationDoc).toBe(
				'# File mutations since last document update\n\nNo file changes detected.',
			);
		});
	});

	describe('context updates', () => {
		let fileWatchingCallback: (event: any) => Promise<void>;

		beforeEach(async () => {
			await manager.initialize();

			// Get the callback from the startFileWatching mock call
			const mockCalls = (
				startFileWatching as MockedFunction<typeof startFileWatching>
			).mock.calls;
			expect(mockCalls).toHaveLength(1);
			fileWatchingCallback = mockCalls[0]![1];

			vi.clearAllMocks();
		});

		it('should update context with file mutations', async () => {
			// Add a file mutation
			await createTestFile('new-file.txt', 'New content');
			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'new-file.txt'),
			});

			// Mock LLM response for update
			mockLLMProvider.chatCompletion.mockResolvedValue({
				choices: [
					{
						message: {
							content:
								'# Updated Context\n\nThis context includes new changes.',
						},
					},
				],
			});

			await manager.updateContext();

			// Check that LLM was called with mutation document
			expect(mockLLMProvider.chatCompletion).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: expect.arrayContaining([
						expect.objectContaining({
							role: 'system',
							content: expect.stringContaining(
								'You will be provided with the current version of the document',
							),
						}),
						expect.objectContaining({
							role: 'user',
							content: expect.stringContaining(
								'# File mutations since last document update',
							),
						}),
					]),
				}),
				[],
			);

			// Check that context was updated
			expect(manager.getCurrentContextContent()).toBe(
				'# Updated Context\n\nThis context includes new changes.',
			);

			// Check that mutations were cleared after update
			const mutationDoc = (manager as any).generateMutationDocument();
			expect(mutationDoc).toContain('No file changes detected');
		});

		it('should not allow concurrent updates', async () => {
			// Add a file mutation so the update will actually proceed
			await createTestFile('test-file.txt', 'Test content');
			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'test-file.txt'),
			});

			// Start first update
			const updatePromise1 = manager.updateContext();

			// Try to start second update immediately
			const updatePromise2 = manager.updateContext();

			await Promise.all([updatePromise1, updatePromise2]);

			// Should have logged that update was skipped
			expect(Logger.info).toHaveBeenCalledWith(
				'Context update already in progress, skipping...',
			);

			// LLM should only be called once
			expect(mockLLMProvider.chatCompletion).toHaveBeenCalledTimes(1);
		});

		it('should handle update errors gracefully', async () => {
			// Add a file mutation so the update will actually proceed
			await createTestFile('error-test.txt', 'Error test content');
			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'error-test.txt'),
			});

			mockLLMProvider.chatCompletion.mockRejectedValue(
				new Error('Update failed'),
			);

			await manager.updateContext();

			expect(Logger.error).toHaveBeenCalledWith(
				'Error updating context:',
				expect.any(Error),
			);
		});

		it('should handle update response without message', async () => {
			// Add a file mutation so the update will actually proceed
			await createTestFile('no-message-test.txt', 'No message test content');
			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'no-message-test.txt'),
			});

			mockLLMProvider.chatCompletion.mockResolvedValue({
				choices: [{}],
			});

			await manager.updateContext();

			expect(Logger.info).toHaveBeenCalledWith(
				expect.stringContaining(
					'No message received from LLM for continuous context',
				),
			);
		});

		it('should skip update when no file mutations exist', async () => {
			// Call updateContext without any file mutations
			await manager.updateContext();

			// Should log that no mutations were detected
			expect(Logger.info).toHaveBeenCalledWith(
				'No file mutations detected, skipping context update',
			);

			// LLM should not be called
			expect(mockLLMProvider.chatCompletion).not.toHaveBeenCalled();
		});
	});

	describe('context retrieval', () => {
		beforeEach(async () => {
			await manager.initialize();
		});

		it('should return current context content', () => {
			const content = manager.getCurrentContextContent();
			expect(content).toBe(
				'# Generated Context\n\nThis is a test context document.',
			);
		});

		it('should return empty string before initialization', () => {
			const uninitializedManager = new ContinuousContextManager();
			const content = uninitializedManager.getCurrentContextContent();
			expect(content).toBe('');
		});
	});

	describe('cleanup', () => {
		it('should cleanup file watcher subscription', async () => {
			await manager.initialize();

			manager.destroy();

			expect(mockUnsubscribe).toHaveBeenCalled();
		});

		it('should not error when destroying uninitialized manager', () => {
			const uninitializedManager = new ContinuousContextManager();
			expect(() => uninitializedManager.destroy()).not.toThrow();
		});
	});

	describe('GitIgnoreParser integration', () => {
		it('should initialize GitIgnoreParser with correct patterns', async () => {
			await manager.initialize();

			expect(startFileWatching).toHaveBeenCalledWith(
				testDir,
				expect.any(Function),
				expect.objectContaining({
					getPatterns: expect.any(Function),
					isIgnored: expect.any(Function),
				}),
			);

			// Verify the GitIgnoreParser was configured with additional patterns
			const gitIgnoreParser = (
				startFileWatching as MockedFunction<typeof startFileWatching>
			).mock.calls[0]![2];
			expect(gitIgnoreParser).toBeDefined();
		});
	});

	describe('file watching error handling', () => {
		it('should handle startFileWatching errors', async () => {
			(
				startFileWatching as MockedFunction<typeof startFileWatching>
			).mockRejectedValue(new Error('File watching failed'));

			await manager.initialize();

			expect(Logger.error).toHaveBeenCalledWith(
				'Error starting file watcher:',
				expect.any(Error),
			);
		});
	});

	describe('path handling', () => {
		let fileWatchingCallback: (event: any) => Promise<void>;

		beforeEach(async () => {
			await manager.initialize();

			// Get the callback from the startFileWatching mock call
			const mockCalls = (
				startFileWatching as MockedFunction<typeof startFileWatching>
			).mock.calls;
			expect(mockCalls).toHaveLength(1);
			fileWatchingCallback = mockCalls[0]![1];
		});

		it('should use relative paths in mutation tracking', async () => {
			const subDir = path.join(testDir, 'src');
			await fs.mkdir(subDir, {recursive: true});
			await createTestFile('src/index.ts', 'export const hello = "world";');

			await fileWatchingCallback({
				type: 'create',
				path: path.join(testDir, 'src', 'index.ts'),
			});

			const mutationDoc = (manager as any).generateMutationDocument();
			expect(mutationDoc).toContain('## src/index.ts - CREATED');
		});
	});
});
