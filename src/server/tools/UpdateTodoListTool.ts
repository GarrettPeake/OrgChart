import {ToolDefinition} from './index.js';
import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {TaskAgent} from '../tasks/TaskAgent.js';

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
	enact: async (args: {todo_items: TodoListItem[]}, invoker: TaskAgent, writeEvent: (event: OrgchartEvent) => void): Promise<string> => {
		writeEvent({
			title: `UpdateTodoList`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.todo_items
						.map(
							i =>
								` * [${
									i.status === 'pending'
										? ' '
										: i.status === 'in_progress'
										? '+'
										: '✓'
								}] \"${i.title}\"`,
						)
						.join('\n'),
				},
			],
		});
		
		invoker.updateTodoList(args.todo_items);
		return 'TODO list successfully updated';
	},
};
