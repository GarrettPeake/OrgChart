import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';

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
	}): Promise<string> => 'NOT IMPLEMENTED',
	formatEvent: async (args: {
		file_path: string;
		edits: {old_string: string; new_string: string}[];
	}): Promise<OrgchartEvent> => ({
		title: `Edit File(${args.file_path})`,
		id: crypto.randomUUID(),
		content: [
			{
				type: DisplayContentType.TEXT,
				content: Object.entries(args.edits)
					.map(e => `SEARCH: ${e[0]}\nREPLACE: ${e[1]}`)
					.join('\n\n'),
			},
		],
	}),
};
