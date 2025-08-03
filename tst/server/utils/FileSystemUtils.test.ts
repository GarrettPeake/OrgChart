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
│ ├ l3/
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
});
