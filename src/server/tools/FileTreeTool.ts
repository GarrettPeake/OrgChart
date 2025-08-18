import {ToolDefinition} from './index.js';
import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {getFileTree} from '../utils/FileSystemUtils.js';
import {TaskAgent} from '../tasks/TaskAgent.js';

export const fileTreeToolDefinition: ToolDefinition = {
	name: 'FileTree',
	descriptionForAgent:
		'Get the directory tree structure under a given directory. The path parameter must be an absolute path.',
	inputSchema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description:
					'A brief explanation (1-2 sentences) of why you need to view the file tree and what you are looking for.',
			},
			path: {
				type: 'string',
				description: 'The path of the directory to create the tree from',
			},
		},
		required: ['reasoning', 'path'],
	},
	enact: async (
		args: {reasoning: string; path: string},
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	): Promise<string> => {
		writeEvent({
			title: `FileTree(${args.path})`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.reasoning,
				},
				{
					type: DisplayContentType.TEXT,
					content: `Path: ${args.path}`,
				},
			],
		});
		return await getFileTree(args.path);
	},
};
