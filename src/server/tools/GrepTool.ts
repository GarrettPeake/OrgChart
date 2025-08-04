import {globSync} from 'glob';
import {ToolDefinition} from './index.js';
import {readFileSync} from 'fs';
import {StreamEvent} from '../../cli/EventStream.js';
export const grepToolDefinition: ToolDefinition = {
	name: 'Grep',
	descriptionForAgent: `- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\\\\s+\\\\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths with at least one match
- Use this tool when you need to find specific patterns within the text
- Do not use this tool to read the entirety of files`,
	inputSchema: {
		type: 'object',
		properties: {
			pattern: {
				type: 'string',
				description:
					'The regular expression pattern to search for in file contents',
			},
			path: {
				type: 'string',
				description: 'The directory to search in.',
			},
			include: {
				type: 'string',
				description:
					"File pattern to filter which files to search (e.g., '*.js' for JavaScript files)",
			},
		},
		required: ['pattern', 'path'],
	},
	enact: async (args: {
		pattern: string;
		path: string;
		include: string;
	}): Promise<string> => grep(args.pattern, args.path, args.include).join('\n'),
	formatEvent: async (args: {
		pattern: string;
		path: string;
		include: string;
	}): Promise<StreamEvent> => ({
		title: `Grep(${args.pattern} in ${args.include} under ${args.path})`,
		content: grep(args.pattern, args.path, args.include).join('\n'),
	}),
};

function grep(pattern: string, path: string, include?: string): string[] {
	const regex = RegExp(pattern);
	let files = globSync(`${path}/**/${include ? include : '*'}`, {
		ignore: [
			'.env',
			'node_modules/**',
			'dist/**',
			'.claude/**',
			'build/**',
			'package-lock.json',
		],
		nodir: true,
	});
	let results: string[] = [];
	for (const file of files) {
		try {
			const content = readFileSync(file, 'utf-8');
			const lines = content.split('\n');
			lines.forEach((line, idx) => {
				if (regex.test(line)) {
					results.push(`${file}:${idx + 1}: ${line}`);
				}
			});
		} catch (err) {
			console.error(`Error reading ${file}:`, err);
		}
	}
	return results;
}
