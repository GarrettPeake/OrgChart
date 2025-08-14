/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
	describe,
	it,
	expect,
	beforeEach,
	vi,
	type MockedFunction,
} from 'vitest';
import {AgentContext, type BlockType} from '@/server/tasks/AgentContext.js';
import {ContinuousContextManager} from '@/server/workflows/ContinuousContext.js';
import {
	CompletionInputMessage,
	ToolCall,
} from '@/server/utils/provider/OpenRouter.js';
import Logger from '@/Logger.js';

// Mock Logger
vi.mock('@/Logger.js', () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock ContinuousContextManager
vi.mock('@/server/workflows/ContinuousContext.js', () => ({
	ContinuousContextManager: vi.fn(() => ({
		getCurrentContextContent: vi.fn().mockReturnValue('Mock context content'),
	})),
}));

// Helper function to create mock tool calls
const createMockToolCall = (
	id: string,
	name: string,
	args: any = {},
): ToolCall => ({
	id,
	type: 'function',
	function: {
		name,
		arguments: JSON.stringify(args),
	},
});

describe('AgentContext', () => {
	let agentContext: AgentContext;
	let mockContinuousContextManager: ContinuousContextManager;
	const testSystemPrompt = 'You are a helpful AI assistant for testing.';

	beforeEach(() => {
		vi.clearAllMocks();
		mockContinuousContextManager = new ContinuousContextManager();
		agentContext = new AgentContext(
			testSystemPrompt,
			mockContinuousContextManager,
		);
	});

	describe('constructor and initialization', () => {
		it('should initialize with system prompt block', () => {
			const blocks = agentContext.getBlocks();
			expect(blocks).toHaveLength(1);
			expect(blocks[0]).toMatchObject({
				type: 'SYSTEM',
				label: 'System Prompt',
				messages: [
					{
						role: 'system',
						content: testSystemPrompt,
					},
				],
			});
			expect(blocks[0]!.metadata?.timestamp).toBeTypeOf('number');
		});
	});

	describe('basic block operations', () => {
		it('should add user blocks correctly', () => {
			agentContext.addUserBlock('Hello, how can you help me?');

			const blocks = agentContext.getBlocks();
			expect(blocks).toHaveLength(2); // System + User

			const userBlock = blocks[1]!;
			expect(userBlock).toMatchObject({
				type: 'USER',
				label: 'User Input',
				messages: [
					{
						role: 'user',
						content: 'Hello, how can you help me?',
					},
				],
			});
		});

		it('should add user blocks with custom labels', () => {
			agentContext.addUserBlock('Test message', 'Custom Label');

			const userBlock = agentContext.getLatestBlockByType('USER');
			expect(userBlock?.label).toBe('Custom Label');
		});

		it('should add assistant blocks correctly', () => {
			agentContext.addAssistantBlock('I can help you with many tasks!');

			const blocks = agentContext.getBlocks();
			expect(blocks).toHaveLength(2); // System + Assistant

			const assistantBlock = blocks[1]!;
			expect(assistantBlock).toMatchObject({
				type: 'ASSISTANT',
				label: 'Assistant Response',
				messages: [
					{
						role: 'assistant',
						content: 'I can help you with many tasks!',
					},
				],
			});
		});

		it('should add assistant blocks with custom labels', () => {
			agentContext.addAssistantBlock('Response', 'Custom Response');

			const assistantBlock = agentContext.getLatestBlockByType('ASSISTANT');
			expect(assistantBlock?.label).toBe('Custom Response');
		});
	});

	describe('parent block operations', () => {
		it('should add parent blocks correctly', () => {
			const parentConversationId = 'parent-123';
			agentContext.addParentBlock(
				'Message from parent agent',
				parentConversationId,
			);

			const parentBlock = agentContext.getLatestBlockByType('PARENT');
			expect(parentBlock).toMatchObject({
				type: 'PARENT',
				label: 'Parent Message',
				messages: [
					{
						role: 'user',
						content: 'Message from parent agent',
					},
				],
			});
			expect(parentBlock?.metadata?.parentConversationId).toBe(
				parentConversationId,
			);
		});

		it('should add parent blocks without conversation ID', () => {
			agentContext.addParentBlock('Message from parent');

			const parentBlock = agentContext.getLatestBlockByType('PARENT');
			expect(parentBlock?.metadata?.parentConversationId).toBeUndefined();
		});
	});

	describe('context block operations', () => {
		it('should add context blocks with content only', () => {
			const contextContent = '# Project Overview\n\nThis is a test project.';
			agentContext.addContextBlock(contextContent);

			const contextBlock = agentContext.getLatestBlockByType('CONTEXT');
			expect(contextBlock).toMatchObject({
				type: 'CONTEXT',
				label: 'Project Context',
				messages: [
					{
						role: 'user',
						content: contextContent,
					},
				],
			});
		});

		it('should add context blocks with simulated response', () => {
			const contextContent = '# Project Overview';
			const simulatedResponse = 'I understand the project context.';

			agentContext.addContextBlock(contextContent, simulatedResponse);

			const contextBlock = agentContext.getLatestBlockByType('CONTEXT');
			expect(contextBlock?.messages).toHaveLength(2);
			expect(contextBlock?.messages[0]).toMatchObject({
				role: 'user',
				content: contextContent,
			});
			expect(contextBlock?.messages[1]).toMatchObject({
				role: 'assistant',
				content: simulatedResponse,
			});
		});
	});

	describe('tool block operations', () => {
		describe('single tool blocks', () => {
			it('should add single tool blocks correctly', () => {
				const toolCall = createMockToolCall('tool-1', 'read_file', {
					path: '/test.txt',
				});
				const toolResult = 'File content here';

				agentContext.addSingleToolBlock(toolCall, toolResult);

				const toolBlock = agentContext.getLatestBlockByType('TOOL');
				expect(toolBlock).toMatchObject({
					type: 'TOOL',
					label: 'read_file',
				});
				expect(toolBlock?.messages).toHaveLength(2);
				expect(toolBlock?.messages[0]).toMatchObject({
					role: 'assistant',
					content: '',
					tool_calls: [toolCall],
				});
				expect(toolBlock?.messages[1]).toMatchObject({
					role: 'tool',
					content: toolResult,
					tool_call_id: 'tool-1',
				});
				expect(toolBlock?.metadata?.toolCallId).toBe('tool-1');
			});
		});

		describe('pending tool blocks', () => {
			it('should add pending tool blocks', () => {
				const toolCall = createMockToolCall('tool-pending', 'bash_command');

				agentContext.addPendingToolBlock(toolCall);

				const toolBlock = agentContext.getLatestBlockByType('TOOL');
				expect(toolBlock?.label).toBe('bash_command (pending)');
				expect(toolBlock?.messages[1]?.content).toBe(
					'Tool execution in progress...',
				);
			});

			it('should update pending tool blocks with results', () => {
				const toolCall = createMockToolCall('tool-update', 'grep_search');
				agentContext.addPendingToolBlock(toolCall);

				const success = agentContext.updateToolBlockResult(
					'tool-update',
					'Search results found',
				);

				expect(success).toBe(true);
				const toolBlock = agentContext.getLatestBlockByType('TOOL');
				expect(toolBlock?.label).toBe('grep_search'); // (pending) removed
				expect(toolBlock?.messages[1]?.content).toBe('Search results found');
			});

			it('should return false when updating non-existent tool call', () => {
				const success = agentContext.updateToolBlockResult(
					'non-existent',
					'result',
				);
				expect(success).toBe(false);
			});

			it('should return false when tool message not found in block', () => {
				// Create a block with no tool message
				agentContext.addUserBlock('test');
				const success = agentContext.updateToolBlockResult(
					'tool-123',
					'result',
				);
				expect(success).toBe(false);
			});
		});

		describe('multiple tool blocks', () => {
			it('should split multiple tool calls into separate blocks', () => {
				const toolCall1 = createMockToolCall('tool-1', 'read_file');
				const toolCall2 = createMockToolCall('tool-2', 'write_file');
				const toolCall3 = createMockToolCall('tool-3', 'bash_command');

				const toolResults = new Map([
					['tool-1', 'File 1 content'],
					['tool-2', 'File written successfully'],
					['tool-3', 'Command executed'],
				]);

				agentContext.addToolBlocks(
					[toolCall1, toolCall2, toolCall3],
					toolResults,
				);

				const toolBlocks = agentContext.getBlocksByType('TOOL');
				expect(toolBlocks).toHaveLength(3);

				// Verify each tool got its own block
				expect(toolBlocks[0]?.label).toBe('read_file');
				expect(toolBlocks[1]?.label).toBe('write_file');
				expect(toolBlocks[2]?.label).toBe('bash_command');

				// Verify results are correctly assigned
				expect(toolBlocks[0]?.messages[1]?.content).toBe('File 1 content');
				expect(toolBlocks[1]?.messages[1]?.content).toBe(
					'File written successfully',
				);
				expect(toolBlocks[2]?.messages[1]?.content).toBe('Command executed');
			});

			it('should handle missing tool results with warnings', () => {
				const toolCall1 = createMockToolCall('tool-1', 'read_file');
				const toolCall2 = createMockToolCall('tool-2', 'write_file');

				// Only provide result for tool-1
				const toolResults = new Map([['tool-1', 'File content']]);

				agentContext.addToolBlocks([toolCall1, toolCall2], toolResults);

				const toolBlocks = agentContext.getBlocksByType('TOOL');
				expect(toolBlocks).toHaveLength(1); // Only tool-1 should be added

				expect(Logger.warn).toHaveBeenCalledWith(
					'Missing tool result for tool call tool-2',
				);
			});
		});
	});

	describe('message conversion', () => {
		it('should convert blocks to flat completion messages', () => {
			agentContext.addUserBlock('Hello');
			agentContext.addAssistantBlock('Hi there!');
			agentContext.addParentBlock('Continue working');

			const messages = agentContext.toCompletionMessages();

			expect(messages).toHaveLength(4); // System + User + Assistant + Parent
			expect(messages[0]?.role).toBe('system');
			expect(messages[1]?.role).toBe('user');
			expect(messages[2]?.role).toBe('assistant');
			expect(messages[3]?.role).toBe('user'); // Parent becomes user message
		});

		it('should handle complex tool blocks in conversion', () => {
			const toolCall = createMockToolCall('tool-1', 'test_tool');
			agentContext.addSingleToolBlock(toolCall, 'Tool result');

			const messages = agentContext.toCompletionMessages();

			// System + Tool (assistant message + tool result)
			expect(messages).toHaveLength(3);
			expect(messages[1]?.role).toBe('assistant');
			expect((messages[1] as any)?.tool_calls).toEqual([toolCall]);
			expect(messages[2]?.role).toBe('tool');
			expect(messages[2]?.content).toBe('Tool result');
		});
	});

	describe('block querying and filtering', () => {
		beforeEach(() => {
			// Set up a diverse set of blocks
			agentContext.addUserBlock('User message');
			agentContext.addAssistantBlock('Assistant response');
			agentContext.addParentBlock('Parent message');
			agentContext.addContextBlock('Context content');

			const toolCall = createMockToolCall('tool-1', 'test_tool');
			agentContext.addSingleToolBlock(toolCall, 'Tool result');
		});

		it('should get blocks by type correctly', () => {
			expect(agentContext.getBlocksByType('SYSTEM')).toHaveLength(1);
			expect(agentContext.getBlocksByType('USER')).toHaveLength(1);
			expect(agentContext.getBlocksByType('ASSISTANT')).toHaveLength(1);
			expect(agentContext.getBlocksByType('PARENT')).toHaveLength(1);
			expect(agentContext.getBlocksByType('CONTEXT')).toHaveLength(1);
			expect(agentContext.getBlocksByType('TOOL')).toHaveLength(1);
		});

		it('should get latest block by type', () => {
			// Add multiple user blocks
			agentContext.addUserBlock('First user message');
			agentContext.addUserBlock('Second user message');

			const latestUser = agentContext.getLatestBlockByType('USER');
			expect(latestUser?.messages[0]?.content).toBe('Second user message');
		});

		it('should return undefined for non-existent block types', () => {
			agentContext.removeBlocksByType('USER'); // Remove all user blocks
			const latestUser = agentContext.getLatestBlockByType('USER');
			expect(latestUser).toBeUndefined();
		});

		it('should remove blocks by type', () => {
			expect(agentContext.getBlocksByType('USER')).toHaveLength(1);

			agentContext.removeBlocksByType('USER');

			expect(agentContext.getBlocksByType('USER')).toHaveLength(0);
			// Other blocks should remain
			expect(agentContext.getBlocksByType('SYSTEM')).toHaveLength(1);
		});
	});

	describe('continuous context integration', () => {
		it('should refresh context blocks from continuous context manager', () => {
			const mockContent = '# Updated Project Context\n\nNew information here.';
			// Correctly mock the method on the instance
			vi.mocked(
				mockContinuousContextManager.getCurrentContextContent,
			).mockReturnValue(mockContent);

			agentContext.refreshContextBlock();

			const contextBlock = agentContext.getLatestBlockByType('CONTEXT');
			expect(contextBlock?.messages[0]?.content).toBe(mockContent);
			expect(contextBlock?.messages[1]?.content).toBe(
				'I understand the current project context and will use this information to assist effectively.',
			);
		});

		it('should remove old context blocks when refreshing', () => {
			// Add initial context
			agentContext.addContextBlock('Old context');
			expect(agentContext.getBlocksByType('CONTEXT')).toHaveLength(1);

			// Refresh context
			agentContext.refreshContextBlock();

			// Should still have only one context block (old one replaced)
			const contextBlocks = agentContext.getBlocksByType('CONTEXT');
			expect(contextBlocks).toHaveLength(1);
			expect(contextBlocks[0]?.messages[0]?.content).toBe(
				'Mock context content',
			);
		});

		it('should handle empty context content gracefully', () => {
			// Correctly mock the method on the instance
			vi.mocked(
				mockContinuousContextManager.getCurrentContextContent,
			).mockReturnValue('');

			agentContext.refreshContextBlock();

			// No context blocks should be added for empty content
			expect(agentContext.getBlocksByType('CONTEXT')).toHaveLength(0);
		});
	});

	describe('statistics and debugging', () => {
		beforeEach(() => {
			// Create a rich context for testing stats
			agentContext.addUserBlock('User message 1');
			agentContext.addUserBlock('User message 2');
			agentContext.addAssistantBlock('Assistant response');
			agentContext.addParentBlock('Parent message');

			const toolCall1 = createMockToolCall('tool-1', 'read_file');
			const toolCall2 = createMockToolCall('tool-2', 'write_file');
			agentContext.addSingleToolBlock(toolCall1, 'File content');
			agentContext.addSingleToolBlock(toolCall2, 'Write successful');
		});

		it('should generate accurate statistics', () => {
			const stats = agentContext.getStats();

			expect(stats.totalBlocks).toBe(7); // System(1) + User(2) + Assistant(1) + Parent(1) + Tool(2) = 7
			expect(stats.totalMessages).toBe(9); // System(1) + User(2) + Assistant(1) + Parent(1) + Tool_blocks(2*2) = 9
			expect(stats.blocksByType).toEqual({
				SYSTEM: 1,
				USER: 2,
				ASSISTANT: 1,
				PARENT: 1,
				CONTEXT: 0,
				TOOL: 2,
			});
			expect(stats.estimatedTokens).toBeGreaterThan(0);
		});

		it('should estimate tokens roughly correctly', () => {
			const stats = agentContext.getStats();

			// Rough estimation: should be proportional to content length
			const expectedMinTokens = Math.ceil(testSystemPrompt.length / 4);
			expect(stats.estimatedTokens).toBeGreaterThanOrEqual(expectedMinTokens);
		});

		it('should generate comprehensive debug summary', () => {
			const summary = agentContext.generateDebugSummary();

			expect(summary).toContain('Agent Context Summary:');
			expect(summary).toContain('Total Blocks: 7'); // Correct count: 7 total blocks
			expect(summary).toContain('Total Messages: 9'); // Correct count: 9 total messages
			expect(summary).toContain('SYSTEM: 1');
			expect(summary).toContain('USER: 2');
			expect(summary).toContain('TOOL: 2');
			expect(summary).toContain('Block Details:');
			expect(summary).toContain('[SYSTEM] System Prompt');
			expect(summary).toContain('[TOOL] read_file');
			expect(summary).toContain('[TOOL] write_file');
		});

		it('should handle empty context in debug summary', () => {
			const emptyContext = new AgentContext(
				'Test',
				mockContinuousContextManager,
			);
			const summary = emptyContext.generateDebugSummary();

			expect(summary).toContain('Total Blocks: 1'); // Just system
			expect(summary).toContain('Total Messages: 1');
			expect(summary).toContain('[SYSTEM] System Prompt (1 messages)');
		});
	});

	describe('edge cases and error handling', () => {
		it('should handle empty system prompt', () => {
			const contextWithEmptyPrompt = new AgentContext(
				'',
				mockContinuousContextManager,
			);
			const blocks = contextWithEmptyPrompt.getBlocks();

			expect(blocks).toHaveLength(1);
			expect(blocks[0]?.messages[0]?.content).toBe('');
		});

		it('should handle empty content in blocks', () => {
			agentContext.addUserBlock('');
			agentContext.addAssistantBlock('');
			agentContext.addParentBlock('');

			const messages = agentContext.toCompletionMessages();
			expect(messages).toHaveLength(4); // System + 3 empty content messages
			expect(messages[1]?.content).toBe('');
			expect(messages[2]?.content).toBe('');
			expect(messages[3]?.content).toBe('');
		});

		it('should handle blocks with no messages gracefully', () => {
			// Manually create a malformed block (shouldn't happen in normal usage)
			const blocks = agentContext.getBlocks();
			blocks.push({
				type: 'USER',
				messages: [],
			});

			const messages = agentContext.toCompletionMessages();
			// Just has the system prompt
			expect(messages).toHaveLength(1);
		});

		it('should maintain timestamp metadata consistently', () => {
			const beforeTime = Date.now();

			agentContext.addUserBlock('Test message');

			const afterTime = Date.now();
			const userBlock = agentContext.getLatestBlockByType('USER');
			const timestamp = userBlock?.metadata?.timestamp;

			expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(timestamp).toBeLessThanOrEqual(afterTime);
		});
	});

	describe('type safety and validation', () => {
		it('should handle all defined block types', () => {
			const blockTypes: BlockType[] = [
				'SYSTEM',
				'USER',
				'ASSISTANT',
				'PARENT',
				'CONTEXT',
				'TOOL',
			];

			for (const type of blockTypes) {
				const blocks = agentContext.getBlocksByType(type);
				expect(Array.isArray(blocks)).toBe(true);
			}
		});

		it('should create blocks with proper TypeScript types', () => {
			agentContext.addUserBlock('test');
			const block = agentContext.getLatestBlockByType('USER');

			// TypeScript compile-time checks
			expect(block?.type).toBe('USER');
			expect(block?.messages).toBeDefined();
			expect(block?.metadata?.timestamp).toBeTypeOf('number');
		});
	});
});
