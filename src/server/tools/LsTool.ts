import {globSync} from 'glob';
import {ToolDefinition} from './index.js';
import {StreamEvent} from '../../cli/EventStream.js';
export const globToolDefinition: ToolDefinition = {
	name: 'LS',
	descriptionForAgent:
		'Lists files and directories in a given path. The path parameter must be a relatice path, not an absolute path. You should generally prefer the Glob and Grep tools, if you know which directories to search.',
	inputSchema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The path of the directory to list contents for',
			},
		},
		required: ['path'],
	},
	enact: async (args: {question: string}): Promise<string> => 'Not implemented',
	formatEvent: async (args: {question: string}): Promise<StreamEvent> => ({
		title: 'LS',
		content: 'Not implemented',
	}),
};
