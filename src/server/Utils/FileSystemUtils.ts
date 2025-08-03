import {GitIgnoreParser} from './GitIgnoreParser.js';
import {getConfig} from './Configuration.js';
import {lstatSync, readdirSync} from 'fs';
import path from 'path';

// Get all files as a tree structure that are not part of the gitignore or known
export const getFileTree = (
	rootDir: string | undefined = undefined,
	maxDepth: number = 15,
) => {
	const config = getConfig();
	const gip = new GitIgnoreParser(rootDir || config.rootDir);
	gip.loadGitRepoPatterns();
	gip.addPatterns(config.ignorePatterns);
	return buildFileTreeDfs(rootDir || config.rootDir, gip, maxDepth);
};

const buildFileTreeDfs = (
	absolutePath: string,
	gip: GitIgnoreParser,
	maxDepth: number,
	depth: number = 0,
	prefix: number[] = [], // 0 = no more children, 1 = final child, 2 = more children
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
				console.log(children.map(it => it.name));
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
		return `${levelPrefix}${path.basename(absolutePath)}`;
	} catch {
		return `${levelPrefix}${path.basename(absolutePath)}: NO ACCESS`;
	}
};

const buildPrefixString = (prefix: number[]): string => {
	return prefix
		.map((it, index) =>
			it === 0 ? ' ' : it === 1 ? '└' : index === prefix.length - 1 ? '├' : '│',
		)
		.join('');
};
