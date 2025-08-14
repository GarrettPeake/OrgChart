import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {getFileTree} from '@server/utils/FileSystemUtils.js';

describe('GetFileTree', () => {
	let testProjectRoot: string;

	async function createTestFile(filePath: string, content = '') {
		const fullPath = path.join(testProjectRoot, filePath);
		await fs.mkdir(path.dirname(fullPath), {recursive: true});
		await fs.writeFile(fullPath, content);
	}

	async function createTestDir(dirPath: string) {
		const fullPath = path.join(testProjectRoot, dirPath, 'filename.txt');
		await fs.mkdir(path.dirname(fullPath), {recursive: true});
	}

	beforeEach(async () => {
		testProjectRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), 'get-file-tree-test-'),
		);
	});

	afterEach(async () => {
		await fs.rm(testProjectRoot, {recursive: true, force: true});
	});

	it('does not throw with valid empty path', async () => {
		expect(() => getFileTree(testProjectRoot)).not.toThrow();
	});

	it('returns empty folder with vald empty path', async () => {
		expect(getFileTree(testProjectRoot)).toEqual(
			`
        ${testProjectRoot}/
            `.trim(),
		);
	});

	it('returns valid tree with populated path at depth', async () => {
		await createTestFile('l1/l2/l3/package.json');
		await createTestFile('l1/l2/l3/package2.json');
		await createTestFile('tp1/package2.json');
		await createTestDir('tp2');
		expect(getFileTree(testProjectRoot)).toEqual(
			`
${testProjectRoot}/
├l1/
│└l2/
│ └l3/
│  ├package.json
│  └package2.json
├tp1/
│└package2.json
└tp2/
            `.trim(),
		);
	});

	it('respects max depth', async () => {
		await createTestFile('l1/l2/l3/package.json');
		await createTestFile('l1/l2/l3/package2.json');
		await createTestFile('l1/l2/l4/package2.json');
		await createTestFile('l1/l2/package2.json');
		await createTestFile('tp1/package2.json');
		expect(getFileTree(testProjectRoot, 2)).toEqual(
			`
${testProjectRoot}/
├l1/
│└l2/
│ ├l3/
│ │└...<further folder depth truncated>
│ ├l4/
│ │└...<further folder depth truncated>
│ └package2.json
└tp1/
 └package2.json
            `.trim(),
		);
	});

	it('respects gitignore rules', async () => {
		await createTestFile('.gitignore', '/package.json');
		await createTestFile('/l1/package.json');
		await createTestFile('package.json');
		await createTestFile('.git/test');
		expect(getFileTree(testProjectRoot, 2)).toEqual(
			`
${testProjectRoot}/
├.gitignore
└l1/
 └package.json
            `.trim(),
		);
	});

	it('includes token counts when includeTokenCounts is true', async () => {
		// Create test files with known content
		await createTestFile('test1.txt', 'Hello world this is a test file');
		await createTestFile('test2.js', 'function test() { return "hello"; }');
		await createTestFile(
			'subfolder/test3.md',
			'# Markdown\n\nThis is markdown content',
		);

		const result = getFileTree(testProjectRoot, 15, true);

		// Should contain token counts for files
		expect(result).toContain('test1.txt - ');
		expect(result).toContain(' tokens');
		expect(result).toContain('test2.js - ');
		expect(result).toContain('test3.md - ');

		// Token counts should be numbers greater than 0
		const tokenMatches = result.match(/(\d+) tokens/g);
		expect(tokenMatches).toBeTruthy();
		expect(tokenMatches!.length).toBeGreaterThan(0);

		// Extract token counts and verify they're reasonable numbers
		tokenMatches!.forEach(match => {
			const count = parseInt(match.split(' ')[0]!);
			expect(count).toBeGreaterThan(5);
			expect(count).toBeLessThan(20);
		});
	});

	it('does not include token counts when includeTokenCounts is false', async () => {
		await createTestFile('test1.txt', 'Hello world this is a test file');
		await createTestFile('test2.js', 'function test() { return "hello"; }');

		const result = getFileTree(testProjectRoot, 15, false);

		// Should not contain token information
		expect(result).not.toContain('tokens');
		expect(result).toContain('test1.txt');
		expect(result).toContain('test2.js');
	});

	it('includes token counts for nested directory structure', async () => {
		await createTestFile('folder1/file1.txt', 'Content in file 1');
		await createTestFile(
			'folder1/folder2/file2.txt',
			'Content in file 2 with more text',
		);
		await createTestFile(
			'folder1/folder2/file3.js',
			'console.log("hello world");',
		);

		const result = getFileTree(testProjectRoot, 15, true);

		// Should show directory structure with token counts for files
		expect(result).toContain('folder1/');
		expect(result).toContain('folder2/');
		expect(result).toContain('file1.txt - ');
		expect(result).toContain('file2.txt - ');
		expect(result).toContain('file3.js - ');
		expect(result).toContain('tokens');

		// Count the number of token references
		const tokenMatches = result.match(/\d+ tokens/g);
		expect(tokenMatches).toHaveLength(3); // Should have 3 files with token counts
	});
});
