import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
    type MockedFunction,
} from 'vitest';
import {readToolDefinition} from '@/server/tools/ReadFileTool.js';
import {readFile} from '@/server/utils/FileSystemUtils.js';
import {DisplayContentType, OrgchartEvent} from '@/server/IOTypes.js';
import {TaskAgent} from '@/server/tasks/TaskAgent.js';

// Mock dependencies
vi.mock('@/server/utils/FileSystemUtils.js', () => ({
    readFile: vi.fn(),
}));

// Mock crypto.randomUUID globally
Object.defineProperty(global, 'crypto', {
    value: {
        randomUUID: vi.fn(),
    },
    writable: true,
});

// Mock TaskAgent
const mockTaskAgent = {} as TaskAgent;

describe('ReadFileTool', () => {
    let mockWriteEvent: MockedFunction<(event: OrgchartEvent) => void>;
    let mockReadFile: MockedFunction<typeof readFile>;
    let mockRandomUUID: MockedFunction<() => string>;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mocks
        mockWriteEvent = vi.fn();
        mockReadFile = vi.mocked(readFile);
        mockRandomUUID = vi.mocked(global.crypto.randomUUID);

        // Default mock implementations
        mockRandomUUID.mockReturnValue('test-uuid-123');
    });

    describe('tool definition', () => {
        it('should have correct name', () => {
            expect(readToolDefinition.name).toBe('Read');
        });

        it('should have proper description for agent', () => {
            expect(readToolDefinition.descriptionForAgent).toContain(
                'Read the contents of a file at the specified path',
            );
            expect(readToolDefinition.descriptionForAgent).toContain(
                'PDF and DOCX files',
            );
        });

        it('should have correct input schema', () => {
            expect(readToolDefinition.inputSchema).toEqual({
                type: 'object',
                properties: {
                    file_path: {
                        type: 'string',
                        description:
                            'The path of the file to read (relative to the current working directory)',
                    },
                    justification: {
                        type: 'string',
                        description:
                            'A short justification describing why you are reading this file',
                    },
                },
                required: ['file_path', 'justification'],
            });
        });
    });

    describe('enact function', () => {
        describe('successful file reading', () => {
            it('should read plain text file successfully', async () => {
                const fileContent = 'This is a test file content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: 'test.txt',
                    justification: 'Testing file read',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(fileContent);
                expect(mockReadFile).toHaveBeenCalledWith('test.txt');
            });

            it('should read PDF file successfully', async () => {
                const pdfContent = 'Extracted PDF text content';
                mockReadFile.mockResolvedValue(pdfContent);

                const args = {
                    file_path: 'document.pdf',
                    justification: 'Reading PDF document',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(pdfContent);
                expect(mockReadFile).toHaveBeenCalledWith('document.pdf');
            });

            it('should read DOCX file successfully', async () => {
                const docxContent = 'Extracted DOCX text content';
                mockReadFile.mockResolvedValue(docxContent);

                const args = {
                    file_path: 'document.docx',
                    justification: 'Reading DOCX document',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(docxContent);
                expect(mockReadFile).toHaveBeenCalledWith('document.docx');
            });

            it('should handle empty file content', async () => {
                mockReadFile.mockResolvedValue('');

                const args = {
                    file_path: 'empty.txt',
                    justification: 'Reading empty file',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe('');
                expect(mockReadFile).toHaveBeenCalledWith('empty.txt');
            });

            it('should handle large file content', async () => {
                const largeContent = 'x'.repeat(10000);
                mockReadFile.mockResolvedValue(largeContent);

                const args = {
                    file_path: 'large.txt',
                    justification: 'Reading large file',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(largeContent);
                expect(mockReadFile).toHaveBeenCalledWith('large.txt');
            });

            it('should handle files with special characters', async () => {
                const specialContent = 'Content with émojis 🚀 and spëcial chars';
                mockReadFile.mockResolvedValue(specialContent);

                const args = {
                    file_path: 'special-chars.txt',
                    justification: 'Reading file with special characters',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(specialContent);
                expect(mockReadFile).toHaveBeenCalledWith('special-chars.txt');
            });
        });

        describe('error handling', () => {
            it('should handle file not found error', async () => {
                const error = new Error('No such file or directory: nonexistent.txt');
                mockReadFile.mockRejectedValue(error);

                const args = {
                    file_path: 'nonexistent.txt',
                    justification: 'Trying to read non-existent file',
                };

                await expect(
                    readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent),
                ).rejects.toThrow('No such file or directory: nonexistent.txt');

                expect(mockReadFile).toHaveBeenCalledWith('nonexistent.txt');
            });

            it('should handle permission denied error', async () => {
                const error = new Error('Permission denied');
                mockReadFile.mockRejectedValue(error);

                const args = {
                    file_path: 'restricted.txt',
                    justification: 'Trying to read restricted file',
                };

                await expect(
                    readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent),
                ).rejects.toThrow('Permission denied');

                expect(mockReadFile).toHaveBeenCalledWith('restricted.txt');
            });

            it('should handle generic file system errors', async () => {
                const error = new Error('I/O error occurred');
                mockReadFile.mockRejectedValue(error);

                const args = {
                    file_path: 'problematic.txt',
                    justification: 'Reading problematic file',
                };

                await expect(
                    readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent),
                ).rejects.toThrow('I/O error occurred');

                expect(mockReadFile).toHaveBeenCalledWith('problematic.txt');
            });

            it('should handle corrupted PDF file error', async () => {
                const error = new Error('Failed to parse PDF: corrupted file');
                mockReadFile.mockRejectedValue(error);

                const args = {
                    file_path: 'corrupted.pdf',
                    justification: 'Reading corrupted PDF',
                };

                await expect(
                    readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent),
                ).rejects.toThrow('Failed to parse PDF: corrupted file');

                expect(mockReadFile).toHaveBeenCalledWith('corrupted.pdf');
            });

            it('should handle corrupted DOCX file error', async () => {
                const error = new Error('Failed to extract DOCX: invalid format');
                mockReadFile.mockRejectedValue(error);

                const args = {
                    file_path: 'corrupted.docx',
                    justification: 'Reading corrupted DOCX',
                };

                await expect(
                    readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent),
                ).rejects.toThrow('Failed to extract DOCX: invalid format');

                expect(mockReadFile).toHaveBeenCalledWith('corrupted.docx');
            });
        });

        describe('event emission', () => {
            it('should emit correct event for successful read', async () => {
                const fileContent = 'Test content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: 'test.txt',
                    justification: 'Testing event emission',
                };

                await readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent);

                expect(mockWriteEvent).toHaveBeenCalledTimes(1);
                expect(mockWriteEvent).toHaveBeenCalledWith({
                    title: 'Read(test.txt)',
                    id: 'test-uuid-123',
                    content: [
                        {
                            type: DisplayContentType.TEXT,
                            content: 'Reading file: test.txt',
                        },
                    ],
                });
            });

            it('should emit event with correct file path for nested files', async () => {
                const fileContent = 'Nested file content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: 'src/components/Button.tsx',
                    justification: 'Reading nested component file',
                };

                await readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent);

                expect(mockWriteEvent).toHaveBeenCalledWith({
                    title: 'Read(src/components/Button.tsx)',
                    id: 'test-uuid-123',
                    content: [
                        {
                            type: DisplayContentType.TEXT,
                            content: 'Reading file: src/components/Button.tsx',
                        },
                    ],
                });
            });

            it('should emit event with correct file path for files with special characters', async () => {
                const fileContent = 'Special file content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: 'files/test-file_v2.1.txt',
                    justification: 'Reading file with special characters in name',
                };

                await readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent);

                expect(mockWriteEvent).toHaveBeenCalledWith({
                    title: 'Read(files/test-file_v2.1.txt)',
                    id: 'test-uuid-123',
                    content: [
                        {
                            type: DisplayContentType.TEXT,
                            content: 'Reading file: files/test-file_v2.1.txt',
                        },
                    ],
                });
            });

            it('should emit event even when file read fails', async () => {
                const error = new Error('File not found');
                mockReadFile.mockRejectedValue(error);

                const args = {
                    file_path: 'missing.txt',
                    justification: 'Testing error event emission',
                };

                await expect(
                    readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent),
                ).rejects.toThrow('File not found');

                // Event should still be emitted before the error is thrown
                expect(mockWriteEvent).toHaveBeenCalledWith({
                    title: 'Read(missing.txt)',
                    id: 'test-uuid-123',
                    content: [
                        {
                            type: DisplayContentType.TEXT,
                            content: 'Reading file: missing.txt',
                        },
                    ],
                });
            });

            it('should generate unique event IDs for multiple calls', async () => {
                mockReadFile.mockResolvedValue('content');
                mockRandomUUID
                    .mockReturnValueOnce('uuid-1')
                    .mockReturnValueOnce('uuid-2')
                    .mockReturnValueOnce('uuid-3');

                const args = {
                    file_path: 'test.txt',
                    justification: 'Testing unique IDs',
                };

                // Make three calls
                await readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent);
                await readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent);
                await readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent);

                expect(mockWriteEvent).toHaveBeenCalledTimes(3);
                expect(mockWriteEvent).toHaveBeenNthCalledWith(
                    1,
                    expect.objectContaining({id: 'uuid-1'}),
                );
                expect(mockWriteEvent).toHaveBeenNthCalledWith(
                    2,
                    expect.objectContaining({id: 'uuid-2'}),
                );
                expect(mockWriteEvent).toHaveBeenNthCalledWith(
                    3,
                    expect.objectContaining({id: 'uuid-3'}),
                );
            });
        });

        describe('input parameter handling', () => {
            it('should handle relative file paths', async () => {
                const fileContent = 'Relative path content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: './relative/path/file.txt',
                    justification: 'Testing relative path',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(fileContent);
                expect(mockReadFile).toHaveBeenCalledWith('./relative/path/file.txt');
            });

            it('should handle absolute file paths', async () => {
                const fileContent = 'Absolute path content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: '/absolute/path/file.txt',
                    justification: 'Testing absolute path',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(fileContent);
                expect(mockReadFile).toHaveBeenCalledWith('/absolute/path/file.txt');
            });

            it('should handle file paths with spaces', async () => {
                const fileContent = 'Spaced path content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: 'path with spaces/file name.txt',
                    justification: 'Testing paths with spaces',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(fileContent);
                expect(mockReadFile).toHaveBeenCalledWith(
                    'path with spaces/file name.txt',
                );
            });

            it('should handle various file extensions', async () => {
                const testCases = [
                    {path: 'file.js', content: 'JavaScript content'},
                    {path: 'file.ts', content: 'TypeScript content'},
                    {path: 'file.json', content: '{"key": "value"}'},
                    {path: 'file.md', content: '# Markdown content'},
                    {path: 'file.xml', content: '<root>XML content</root>'},
                    {path: 'file.csv', content: 'col1,col2\nval1,val2'},
                    {path: 'file.log', content: 'Log entry'},
                    {path: 'file', content: 'No extension file'},
                ];

                for (const testCase of testCases) {
                    mockReadFile.mockResolvedValue(testCase.content);

                    const args = {
                        file_path: testCase.path,
                        justification: `Testing ${testCase.path}`,
                    };

                    const result = await readToolDefinition.enact(
                        args,
                        mockTaskAgent,
                        mockWriteEvent,
                    );

                    expect(result).toBe(testCase.content);
                    expect(mockReadFile).toHaveBeenCalledWith(testCase.path);
                }
            });

            it('should pass justification parameter but not use it in execution', async () => {
                const fileContent = 'Test content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: 'test.txt',
                    justification: 'This is a detailed justification for reading the file',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(fileContent);
                // Justification should not affect the readFile call
                expect(mockReadFile).toHaveBeenCalledWith('test.txt');
            });
        });

        describe('integration with FileSystemUtils', () => {
            it('should delegate all file reading logic to FileSystemUtils.readFile', async () => {
                const fileContent = 'Delegated content';
                mockReadFile.mockResolvedValue(fileContent);

                const args = {
                    file_path: 'test.txt',
                    justification: 'Testing delegation',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(fileContent);
                expect(mockReadFile).toHaveBeenCalledTimes(1);
                expect(mockReadFile).toHaveBeenCalledWith('test.txt');
            });

            it('should return exact content from FileSystemUtils without modification', async () => {
                const originalContent = 'Original\nContent\nWith\nNewlines\n\nAnd\tTabs';
                mockReadFile.mockResolvedValue(originalContent);

                const args = {
                    file_path: 'formatted.txt',
                    justification: 'Testing content preservation',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(originalContent);
                expect(result).toContain('\n');
                expect(result).toContain('\t');
            });

            it('should propagate FileSystemUtils errors without modification', async () => {
                const originalError = new Error(
                    'Failed to read file test.txt: ENOENT: no such file or directory',
                );
                mockReadFile.mockRejectedValue(originalError);

                const args = {
                    file_path: 'test.txt',
                    justification: 'Testing error propagation',
                };

                await expect(
                    readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent),
                ).rejects.toThrow(originalError);
            });
        });

        describe('async behavior', () => {
            it('should handle async file reading correctly', async () => {
                const fileContent = 'Async content';
                mockReadFile.mockImplementation(
                    () =>
                        new Promise(resolve =>
                            setTimeout(() => resolve(fileContent), 10),
                        ),
                );

                const args = {
                    file_path: 'async.txt',
                    justification: 'Testing async behavior',
                };

                const result = await readToolDefinition.enact(
                    args,
                    mockTaskAgent,
                    mockWriteEvent,
                );

                expect(result).toBe(fileContent);
            });

            it('should handle concurrent file reads', async () => {
                mockReadFile
                    .mockResolvedValueOnce('Content 1')
                    .mockResolvedValueOnce('Content 2')
                    .mockResolvedValueOnce('Content 3');

                const args1 = {file_path: 'file1.txt', justification: 'Read 1'};
                const args2 = {file_path: 'file2.txt', justification: 'Read 2'};
                const args3 = {file_path: 'file3.txt', justification: 'Read 3'};

                const [result1, result2, result3] = await Promise.all([
                    readToolDefinition.enact(args1, mockTaskAgent, mockWriteEvent),
                    readToolDefinition.enact(args2, mockTaskAgent, mockWriteEvent),
                    readToolDefinition.enact(args3, mockTaskAgent, mockWriteEvent),
                ]);

                expect(result1).toBe('Content 1');
                expect(result2).toBe('Content 2');
                expect(result3).toBe('Content 3');
                expect(mockReadFile).toHaveBeenCalledTimes(3);
            });
        });
    });

    describe('type safety', () => {
        it('should enforce required parameters in TypeScript', () => {
            // This test verifies the TypeScript interface is correctly defined
            // The actual enforcement happens at compile time
            const validArgs = {
                file_path: 'test.txt',
                justification: 'Required parameter test',
            };

            expect(validArgs).toHaveProperty('file_path');
            expect(validArgs).toHaveProperty('justification');
            expect(typeof validArgs.file_path).toBe('string');
            expect(typeof validArgs.justification).toBe('string');
        });

        it('should return Promise<string> as specified in interface', async () => {
            mockReadFile.mockResolvedValue('test content');

            const args = {
                file_path: 'test.txt',
                justification: 'Type safety test',
            };

            const result = readToolDefinition.enact(args, mockTaskAgent, mockWriteEvent);

            expect(result).toBeInstanceOf(Promise);
            expect(typeof (await result)).toBe('string');
        });
    });
});
