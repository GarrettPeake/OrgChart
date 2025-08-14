import {GitIgnoreParser} from './GitIgnoreParser.js';
import {getConfig} from './Configuration.js';
import {lstatSync, readdirSync, readFileSync} from 'fs';
import path from 'path';
// @ts-ignore
import pdf from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import Logger from '@/Logger.js';
import {subscribe} from '@parcel/watcher';
import {encodingForModel} from 'js-tiktoken';

// Get token count for a file using tiktoken
const getTokenCount = (filePath: string): number => {
	try {
		const encoding = encodingForModel('gpt-4');
		const content = readFileSync(filePath, 'utf-8');
		const tokens = encoding.encode(content);
		return tokens.length;
	} catch (error) {
		// Return 0 for binary files or files that can't be read
		return 0;
	}
};

// Get all files as a tree structure that are not part of the gitignore or known
export const getFileTree = (
	rootDir: string | undefined = undefined,
	maxDepth: number = 15,
	includeTokenCounts: boolean = false,
) => {
	const config = getConfig();
	const gip = new GitIgnoreParser(rootDir || config.rootDir);
	gip.loadGitRepoPatterns();
	gip.addPatterns(config.ignorePatterns);
	return buildFileTreeDfs(
		rootDir || config.rootDir,
		gip,
		maxDepth,
		0,
		[],
		includeTokenCounts,
	);
};

const buildFileTreeDfs = (
	absolutePath: string,
	gip: GitIgnoreParser,
	maxDepth: number,
	depth: number = 0,
	prefix: number[] = [], // 0 = no more children, 1 = final child, 2 = more children
	includeTokenCounts: boolean = false,
): string => {
	// Construct a string representing the nesting of this line item
	const levelPrefix = buildPrefixString(prefix);
	// If this was the final child of the direct parent, mark the prefix as having no more children
	if (prefix[prefix.length - 1] === 1) {
		prefix[prefix.length - 1] = 0;
	}
	// Attempt to access the path, marking it as no access if it fails
	try {
		const stats = lstatSync(absolutePath);
		// For directories we use recursion to construct the path
		if (stats.isDirectory()) {
			let res = `${levelPrefix}${
				depth === 0 ? absolutePath : path.basename(absolutePath)
			}/`;
			// Don't recurse if it would pass the max depth
			if (depth <= maxDepth) {
				// Find all children, filtering any that match the git ignore
				const children = readdirSync(absolutePath, {
					withFileTypes: true,
				}).filter(child => !gip.isIgnored(path.join(absolutePath, child.name)));
				// For each child add the recursive result
				for (const [index, child] of children.entries()) {
					res +=
						'\n' +
						buildFileTreeDfs(
							path.join(absolutePath, child.name),
							gip,
							maxDepth,
							depth + 1,
							prefix.concat([index === children.length - 1 ? 1 : 2]),
							includeTokenCounts,
						);
				}
			} else {
				res += `\n${buildPrefixString(
					prefix.concat([1]),
				)}...<further folder depth truncated>`;
			}
			return res;
		}
		// For files we can just return the line item
		const fileName = path.basename(absolutePath);
		if (includeTokenCounts) {
			const tokenCount = getTokenCount(absolutePath);
			return `${levelPrefix}${fileName} - ${tokenCount} tokens`;
		}
		return `${levelPrefix}${fileName}`;
	} catch (e: any) {
		return `${levelPrefix}${path.basename(absolutePath)} -> error: ${
			e.message
		}`;
	}
};

const buildPrefixString = (prefix: number[]): string => {
	return prefix
		.map((it, index) =>
			it === 0 ? ' ' : it === 1 ? '└' : index === prefix.length - 1 ? '├' : '│',
		)
		.join('');
};

export const readFile = async (file_path: string): Promise<string> => {
	const fs = await import('fs/promises');
	const path = await import('path');

	try {
		const filePath = path.resolve(file_path);
		const fileExtension = path.extname(filePath).toLowerCase();

		if (fileExtension === '.pdf') {
			const buffer = await fs.readFile(filePath);
			const data = await pdf(buffer);
			return data.text;
		} else if (fileExtension === '.docx') {
			const buffer = await fs.readFile(filePath);
			const result = await mammoth.extractRawText({buffer});
			return result.value;
		} else {
			const content = await fs.readFile(filePath, 'utf-8');
			return content;
		}
	} catch (error) {
		Logger.error(error, `Failed to read file: ${file_path}`);
		if (
			error instanceof Error &&
			error.message.includes('no such file or directory')
		) {
			Logger.error(error, 'Failed to read file');
			return `No such file or directory: ${file_path}`;
		}
		throw new Error(
			`Failed to read file ${file_path}: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
};

export const getFormattedContext = async (
	relativeBasePath: string = './',
	maxDepth: number = 10,
): Promise<string> => {
	const config = getConfig();
	const gip = new GitIgnoreParser(config.rootDir);
	gip.loadGitRepoPatterns();
	gip.addPatterns([...config.ignorePatterns, 'package-lock.json']); // TODO: Standardize a list of files to be ignored, or even create an AI powered ".aiignore"
	const absoluteBasePath = path.join(process.cwd(), relativeBasePath);
	return await buildFormattedContextDfs(absoluteBasePath, gip, maxDepth);
};

const buildFormattedContextDfs = async (
	absolutePath: string,
	gip: GitIgnoreParser,
	maxDepth: number,
	depth: number = 0,
): Promise<string> => {
	// Construct a string representing the nesting of this line item
	const levelPrefix = '#'.repeat(depth + 1) + ' ';
	// Attempt to access the path, marking it as no access if it fails
	try {
		const stats = lstatSync(absolutePath);
		// For directories we use recursion to construct the path
		if (stats.isDirectory()) {
			let res = `${levelPrefix}${
				depth === 0 ? absolutePath : path.basename(absolutePath)
			}/  `;
			// Don't recurse if it would pass the max depth
			if (depth <= maxDepth) {
				// Find all children, filtering any that match the git ignore
				const children = readdirSync(absolutePath, {
					withFileTypes: true,
				}).filter(child => !gip.isIgnored(path.join(absolutePath, child.name)));
				// For each child add the recursive result
				for (const [index, child] of children.entries()) {
					res +=
						'\n' +
						(await buildFormattedContextDfs(
							path.join(absolutePath, child.name),
							gip,
							maxDepth,
							depth + 1,
						));
				}
			} else {
				res += `\n${'#'.repeat(depth + 2)}\n<further folder depth truncated>`;
			}
			return res;
		}
		// For files we can just return the item with content
		return `${levelPrefix}${path.basename(absolutePath)}\n\n\`\`\`\`\n${(
			await readFile(absolutePath)
		).trim()}\n\`\`\`\`\n`;
	} catch (e: any) {
		return `${levelPrefix}${path.basename(
			absolutePath,
		)} (Failed to read content)`;
	}
};

export const startFileWatching = async (
	watchDir: string,
	onFileEvent: (event: any) => Promise<void>,
	gitIgnoreParser?: GitIgnoreParser,
): Promise<() => void> => {
	const config = getConfig();
	const gip =
		gitIgnoreParser ||
		(() => {
			const parser = new GitIgnoreParser(config.rootDir);
			parser.loadGitRepoPatterns();
			parser.addPatterns(config.ignorePatterns);
			return parser;
		})();

	try {
		const subscription = await subscribe(watchDir, async (err, events) => {
			if (err) {
				Logger.error('File watcher error:', err);
				return;
			}

			for (const event of events) {
				const relativePath = path.relative(watchDir, event.path);

				// Skip ignored files
				if (gip.isIgnored(event.path)) {
					continue;
				}

				await onFileEvent(event);
			}
		});

		return () => subscription.unsubscribe();
	} catch (error) {
		Logger.error('Error starting file watcher:', error);
		throw error;
	}
};
