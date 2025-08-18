import {ToolDefinition} from './index.js';
import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {TaskAgent} from '../tasks/TaskAgent.js';
import {agents} from '../agents/Agents.js';

const descriptionForAgent = `Update your TODO list`;
export const updateTodoListToolName = 'UpdateTodoList';

export type TodoListItem = {
	title: string;
	detailed_description: string;
	best_agent_for_task?: string;
	status: 'pending' | 'in_progress' | 'completed';
};

export const updateTodoListToolDefinition = (
	canDelegate: boolean,
): ToolDefinition => ({
	name: updateTodoListToolName,
	descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description:
					'A brief explanation (1-2 sentences) of why you are updating the todo list and how it helps organize the work.',
			},
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
						best_agent_for_task: canDelegate
							? {
									type: 'string',
									description:
										'The id of the agent you believe would be best suited to perform this task. If you believe you are the **best** agent to perform this task, you can use "me" as the value',
							  }
							: undefined,
						status: {
							type: 'string',
							description:
								'The future status of the task assuming all parallel tool calls succeed',
							enum: ['pending', 'in_progress', 'completed'],
						},
					},
				},
				description:
					'Comprehensive list of subtasks required to complete your current task',
			},
		},
		required: ['reasoning', 'todo_items'],
	},
	enact: async (
		args: {reasoning: string; todo_items: TodoListItem[]},
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	): Promise<string> => {
		writeEvent({
			title: `UpdateTodoList`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.reasoning,
				},
				{
					type: DisplayContentType.TEXT,
					content: args.todo_items
						.map(
							i =>
								`${
									i.status === 'pending'
										? '☐'
										: i.status === 'in_progress'
										? '⚀'
										: '☑'
								} ${
									i.best_agent_for_task
										? `${
												i.best_agent_for_task in agents
													? agents[i.best_agent_for_task]?.name
													: 'No delegation'
										  } - `
										: ''
								}${i.title}`,
						)
						.join('\n'),
				},
			],
		});

		invoker.updateTodoList(args.todo_items);
		return 'TODO list successfully updated';
	},
});
