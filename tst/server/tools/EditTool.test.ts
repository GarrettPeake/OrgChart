import {vi, describe, test, expect, beforeEach} from 'vitest';

vi.mock('fs/promises', () => ({
	default: {
		access: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
	},
}));

vi.mock('diff', () => ({
	createPatch: vi.fn(),
}));

import {editToolDefinition} from '@server/tools/EditTool';
import fs from 'fs/promises';
import {createPatch} from 'diff';

const mockFs = fs as any;
const mockCreatePatch = createPatch as any;

describe('EditTool', () => {
	const MOCK_FILE_PATH = 'test_file.txt';
	const MOCK_REASONING = 'Test reasoning';
	const mockInvoker = {} as any; // Mock TaskAgent invoker
	const mockWriteEvent = vi.fn(); // Mock writeEvent function

	beforeEach(() => {
		// Reset mocks before each test
		mockFs.access.mockReset();
		mockFs.readFile.mockReset();
		mockFs.writeFile.mockReset();
		mockCreatePatch.mockReset();
		mockWriteEvent.mockReset();
	});

	// 1. File existence validation
	test('should throw error if file does not exist', async () => {
		mockFs.access.mockRejectedValueOnce(new Error('File not found'));

		const edits = [
			{
				old_content: 'old content',
				new_content: 'new content',
			},
		];

		await expect(
			editToolDefinition.enact(
				{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
				mockInvoker,
				mockWriteEvent,
			),
		).rejects.toThrow(`File ${MOCK_FILE_PATH} does not exist`);

		expect(mockFs.access).toHaveBeenCalledWith(MOCK_FILE_PATH);
		expect(mockFs.readFile).not.toHaveBeenCalled();
		expect(mockFs.writeFile).not.toHaveBeenCalled();
	});

	// 2. Successful single and multiple edits
	test('should successfully apply a single edit', async () => {
		const originalContent = 'This is the old content.\nAnother line.';
		const expectedContent = 'This is the new content.\nAnother line.';
		const mockPatch = 'mock patch for single edit';

		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);
		mockCreatePatch.mockReturnValueOnce(mockPatch);

		const edits = [
			{
				old_content: 'old content',
				new_content: 'new content',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.access).toHaveBeenCalledWith(MOCK_FILE_PATH);
		expect(mockFs.readFile).toHaveBeenCalledWith(MOCK_FILE_PATH, 'utf8');
		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			expectedContent,
			'utf8',
		);
		expect(mockCreatePatch).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			originalContent,
			expectedContent,
		);
		expect(result).toBe(mockPatch);
		expect(mockWriteEvent).toHaveBeenCalledTimes(1);
	});

	test('should successfully apply multiple non-overlapping edits', async () => {
		const originalContent =
			'Line 1: old content A\nLine 2: old content B\nLine 3: old content C';
		const expectedContent =
			'Line 1: new content A\nLine 2: modified content B\nLine 3: new content C';
		const mockPatch = 'mock patch for multiple edits';

		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);
		mockCreatePatch.mockReturnValueOnce(mockPatch);

		const edits = [
			{
				old_content: 'old content A',
				new_content: 'new content A',
			},
			{
				old_content: 'old content B',
				new_content: 'modified content B',
			},
			{
				old_content: 'old content C',
				new_content: 'new content C',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			expectedContent,
			'utf8',
		);
		expect(mockCreatePatch).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			originalContent,
			expectedContent,
		);
		expect(result).toBe(mockPatch);
	});

	// 3. 'old_content' string validation
	test("should throw error if 'old_content' string is not found", async () => {
		const originalContent = 'This is the original content.';
		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);

		const edits = [
			{
				old_content: 'non-existent string',
				new_content: 'new content',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(result).toContain(
			`Failed to apply edits, you should re-read the file to ensure your 'old_content' strings are accurate and unique:\nEdit 0: Could not find 'old_content' string: \n\`\`\`\nnon-existent string\n\`\`\`\n`,
		);

		expect(mockFs.writeFile).not.toHaveBeenCalled();
	});

	// 4. Uniqueness validation
	test("should throw error if 'old_content' string is not unique", async () => {
		const originalContent = 'content A content A content B';
		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);

		const edits = [
			{
				old_content: 'content A',
				new_content: 'new content',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(result).toContain(
			`Failed to apply edits, you should re-read the file to ensure your 'old_content' strings are accurate and unique:\nEdit 0: 'old_content' string \n\`\`\`\ncontent A\n\`\`\`\n is not unique - found multiple matches`,
		);

		expect(mockFs.writeFile).not.toHaveBeenCalled();
	});

	// 5. Multiple edits handling
	test('should correctly handle multiple independent edits', async () => {
		const originalContent = 'Line 1: abcdef\nLine 2: ghijkl';
		const expectedContent = 'Line 1: XYZef\nLine 2: MNOkl';
		const mockPatch = 'mock patch for multiple edits';

		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);
		mockCreatePatch.mockReturnValueOnce(mockPatch);

		const edits = [
			{
				old_content: 'abcd',
				new_content: 'XYZ',
			},
			{
				old_content: 'ghij',
				new_content: 'MNO',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			expectedContent,
			'utf8',
		);
		expect(mockCreatePatch).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			originalContent,
			expectedContent,
		);
		expect(result).toBe(mockPatch);
	});

	// 6. No changes scenario
	test("should return 'No changes were made' if originalContent equals modifiedContent", async () => {
		const originalContent = 'This is some content.';
		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);

		const edits = [
			{
				old_content: 'some content',
				new_content: 'some content',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			originalContent,
			'utf8',
		);
		expect(result).toBe(`No changes were made to ${MOCK_FILE_PATH}.`);
		expect(mockCreatePatch).not.toHaveBeenCalled();
	});

	// 7. Empty new_content (Content Removal)
	test('should remove content when new_content is an empty string', async () => {
		const originalContent = 'This is some content to remove.';
		const expectedContent = 'This is  to remove.';
		const mockPatch = 'mock patch for content removal';

		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);
		mockCreatePatch.mockReturnValueOnce(mockPatch);

		const edits = [
			{
				old_content: 'some content',
				new_content: '',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			expectedContent,
			'utf8',
		);
		expect(mockCreatePatch).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			originalContent,
			expectedContent,
		);
		expect(result).toBe(mockPatch);
	});

	// 8. Line deletion
	test('should delete entire lines', async () => {
		const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
		const expectedContent = 'Line 1\nLine 4';
		const mockPatch = 'mock patch for line deletion';

		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);
		mockCreatePatch.mockReturnValueOnce(mockPatch);

		const edits = [
			{
				old_content: 'Line 2\nLine 3\n',
				new_content: '',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			expectedContent,
			'utf8',
		);
		expect(mockCreatePatch).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			originalContent,
			expectedContent,
		);
		expect(result).toBe(mockPatch);
	});

	// 9. Error handling (File System Errors)
	test('should handle fs.readFile errors', async () => {
		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockRejectedValueOnce(new Error('Read file failed'));

		const edits = [
			{
				old_content: 'old content',
				new_content: 'new content',
			},
		];

		await expect(
			editToolDefinition.enact(
				{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
				mockInvoker,
				mockWriteEvent,
			),
		).rejects.toThrow('Read file failed');

		expect(mockFs.writeFile).not.toHaveBeenCalled();
	});

	test('should handle fs.writeFile errors', async () => {
		const originalContent = 'Some content.';
		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);
		mockFs.writeFile.mockRejectedValueOnce(new Error('Write file failed'));

		const edits = [
			{
				old_content: 'content',
				new_content: 'modified content',
			},
		];

		await expect(
			editToolDefinition.enact(
				{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
				mockInvoker,
				mockWriteEvent,
			),
		).rejects.toThrow('Write file failed');

		expect(mockFs.writeFile).toHaveBeenCalled();
	});

	// 10. Edge cases
	test('should handle edits at the beginning and end of the file', async () => {
		const originalContent = 'START\nmiddle\nEND';
		const expectedContent = 'NEW_START\nmiddle\nNEW_END';
		const mockPatch = 'mock patch for edge cases';

		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);
		mockCreatePatch.mockReturnValueOnce(mockPatch);

		const edits = [
			{
				old_content: 'START',
				new_content: 'NEW_START',
			},
			{
				old_content: 'END',
				new_content: 'NEW_END',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			expectedContent,
			'utf8',
		);
		expect(mockCreatePatch).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			originalContent,
			expectedContent,
		);
		expect(result).toBe(mockPatch);
	});

	test("should handle special characters in 'old_content' strings", async () => {
		const originalContent = 'Line with $pecial ch@racters and (parentheses).';
		const expectedContent = 'Line with repl@ced ch@racters and [brackets].';
		const mockPatch = 'mock patch for special chars';

		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(originalContent);
		mockCreatePatch.mockReturnValueOnce(mockPatch);

		const edits = [
			{
				old_content: '$pecial ch@racters',
				new_content: 'repl@ced ch@racters',
			},
			{
				old_content: '(parentheses).',
				new_content: '[brackets].',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			expectedContent,
			'utf8',
		);
		expect(mockCreatePatch).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			originalContent,
			expectedContent,
		);
		expect(result).toBe(mockPatch);
	});

	test('should handle large file content', async () => {
		const largeContent = 'a'.repeat(10000) + 'target' + 'b'.repeat(10000);
		const expectedLargeContent =
			'a'.repeat(10000) + 'REPLACED' + 'b'.repeat(10000);
		const mockPatch = 'mock patch for large file';

		mockFs.access.mockResolvedValueOnce(undefined);
		mockFs.readFile.mockResolvedValueOnce(largeContent);
		mockCreatePatch.mockReturnValueOnce(mockPatch);

		const edits = [
			{
				old_content: 'target',
				new_content: 'REPLACED',
			},
		];

		const result = await editToolDefinition.enact(
			{reasoning: MOCK_REASONING, file_path: MOCK_FILE_PATH, edits},
			mockInvoker,
			mockWriteEvent,
		);

		expect(mockFs.writeFile).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			expectedLargeContent,
			'utf8',
		);
		expect(mockCreatePatch).toHaveBeenCalledWith(
			MOCK_FILE_PATH,
			largeContent,
			expectedLargeContent,
		);
		expect(result).toBe(mockPatch);
	});
});
