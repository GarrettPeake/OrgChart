import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';

export const editToolDefinition: ToolDefinition = {
	name: 'MultiEdit',
	descriptionForAgent:
		'Makes multiple changes to a single file in one operation. Use this tool to edit files by providing the exact text to replace and the new text.',
	inputSchema: {
		type: 'object',
		properties: {
			file_path: {
				type: 'string',
				description: 'Absolute path to the file to modify',
			},
			edits: {
				type: 'array',
				description:
					'Array of edit operations, each containing old_string and new_string',
				items: {
					type: 'object',
					properties: {
						old_string: {
							type: 'string',
							description: 'Exact text to replace',
						},
						new_string: {
							type: 'string',
							description: 'The replacement text',
						},
					},
					required: ['old_string', 'new_string'],
				},
			},
		},
		required: ['file_path', 'edits'],
	},
	enact: async (args: {
		file_path: string;
		edits: {old_string: string; new_string: string}[];
	}, invoker: TaskAgent, writeEvent: (event: OrgchartEvent) => void): Promise<string> => {
		writeEvent({
			title: `Edit File(${args.file_path})`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.edits
						.map((edit, index) => `Edit ${index + 1}:\nSEARCH: ${edit.old_string}\nREPLACE: ${edit.new_string}`)
						.join('\n\n'),
				},
			],
		});
		return 'NOT IMPLEMENTED';
	},
};
