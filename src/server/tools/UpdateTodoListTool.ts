import {ToolDefinition} from './index.js';
import {StreamEvent} from '../../cli/EventStream.js';

const descriptionForAgent = `Update your TODO list`;
export const updateTodoListToolName = 'UpdateTodoList';

export type TodoListItem = {
	title: string;
	detailed_description: string;
	status: 'pending' | 'in_progress' | 'completed';
};

export const updateTodoListToolDefinition: ToolDefinition = {
	name: updateTodoListToolName,
	descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			todo_items: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						title: {
							type: 'string',
							description: 'A concise title for the subtask',
						},
						detailed_description: {
							type: 'string',
							description:
								'A detailed description of what must be completed in scope of the subtask',
						},
						status: {
							type: 'string',
							description: 'A concise title for the ',
							enum: ['pending', 'in_progress', 'completed'],
						},
					},
				},
				description:
					'Comprehensive list of subtasks required to complete your current task',
			},
		},
		required: ['todo_items'],
	},
	enact: async (args: {todo_items: TodoListItem[]}): Promise<string> =>
		'TODO list successfully updated',
	formatEvent: async (args: {
		todo_items: TodoListItem[];
	}): Promise<StreamEvent> => ({
		title: `UpdateTodoList`,
		content: args.todo_items
			.map(
				i =>
					` * [${
						i.status === 'pending'
							? ' '
							: i.status === 'in_progress'
							? '+'
							: 'X'
					}] \"${i.title}\": ${i.detailed_description}`,
			)
			.join('\n'),
	}),
};
