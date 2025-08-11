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
			path: {
				type: 'string',
				description: 'The path of the directory to create the tree from',
			},
		},
		required: ['path'],
	},
	enact: async (args: {path: string}, invoker: TaskAgent, writeEvent: (event: OrgchartEvent) => void): Promise<string> => {
		writeEvent({
			title: `FileTree(${args.path})`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: 'File tree provided to agent',
				},
			],
		});
		return await getFileTree(args.path);
	},
};
