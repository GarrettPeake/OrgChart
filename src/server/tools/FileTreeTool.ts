import {ToolDefinition} from './index.js';
import {StreamEvent} from '../../cli/EventStream.js';
import {getFileTree} from '../utils/FileSystemUtils.js';

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
	enact: async (args: {path: string}): Promise<string> =>
		getFileTree(args.path),
	formatEvent: async (args: {path: string}): Promise<StreamEvent> => ({
		title: `FileTree(${args.path})`,
		content: 'File tree provided to agent', // TODO: Print the first few lines
	}),
};
