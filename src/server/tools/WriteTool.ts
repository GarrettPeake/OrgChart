import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';
import fs from 'fs/promises';
import path from 'path';

const descriptionForAgent = `Request to write content to a file at the specified path. If the file exists, it will be overwritten with the provided content. If the file doesn't exist, it will be created. This tool will automatically create any directories needed to write the file.

Usage:
- The file_path parameter must be an relative path to the current working directory
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.`;

export const writeToolDefinition: ToolDefinition = {
	name: 'Write',
	descriptionForAgent: descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			file_path: {
				type: 'string',
				description: `The path of the file to write to (relative to the current working directory`,
			},
			content: {
				type: 'string',
				description:
					"The content to write to the file. ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions. You MUST include ALL parts of the file, even if they haven't been modified.",
			},
		},
		required: ['file_path', 'content'],
	},
	enact: async (
		args: {
			file_path: string;
			content: string;
		},
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	): Promise<string> => {
		writeEvent({
			title: `Write(${args.file_path})`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.content.split('\n').slice(0, 8).join('\n'),
				},
			],
		});

		try {
			// Ensure the directory exists
			const dir = path.dirname(args.file_path);
			await fs.mkdir(dir, {recursive: true});

			// Write the content to the file
			await fs.writeFile(args.file_path, args.content, 'utf8');

			return `Successfully wrote ${args.content.length} characters to ${args.file_path}`;
		} catch (error) {
			throw new Error(`Failed to write file ${args.file_path}: ${error}`);
		}
	},
};
