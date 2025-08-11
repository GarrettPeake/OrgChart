import {ToolDefinition} from './index.js';
import {readFile} from '../utils/FileSystemUtils.js';
import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {TaskAgent} from '../tasks/TaskAgent.js';

const descriptionForAgent = `Read the contents of a file at the specified path. Use this when you need to examine the contents of an existing file you do not know the contents of, for example to analyze code, review text files, or extract information from configuration files. Automatically extracts raw text from PDF and DOCX files. May not be suitable for other types of binary files, as it returns the raw content as a string.`;

export const readToolDefinition: ToolDefinition = {
	name: 'Read',
	descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			file_path: {
				type: 'string',
				description: `The path of the file to read (relative to the current working directory)`,
			},
			justification: {
				type: 'string',
				description: `A short justification describing why you are reading this file`,
			},
		},
		required: ['file_path', 'justification'],
	},
	enact: async (
		args: {file_path: string},
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	): Promise<string> => {
		writeEvent({
			title: `Read(${args.file_path})`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: `Reading file: ${args.file_path}`,
				},
			],
		});
		return await readFile(args.file_path);
	},
};
