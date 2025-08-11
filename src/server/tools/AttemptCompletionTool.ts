import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';

export const attemptCompletionToolName = 'AttemptCompletion';

const descriptionForAgent = `This tool is used to let the requester know that the work has been completed. You should present a concise and poignant summary of the results of your work through the "result" parameter. This summary should give a high level overview of everything you managed to accomplish relating to the task as well as anything you did not manage to accomplish.
You should attempt to accomplish all components of the requested task before using this tool.
IMPORTANT NOTE: This tool CANNOT be used until you've used at least one other tool prior. Failure to do so will result in code corruption and system failure.`;

export const attemptCompletionToolDefinition: ToolDefinition = {
	name: attemptCompletionToolName,
	descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			result: {
				type: 'string',
				description:
					"The result of the task. Formulate this result in a way that is final and does not require further input from the user. Don't end your result with questions or offers for further assistance.",
			},
		},
		required: ['result'],
	},
	enact: async (args: {result: string}, invoker: TaskAgent, writeEvent: (event: OrgchartEvent) => void): Promise<string> => {
		writeEvent({
			title: 'Task Complete',
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.result,
				},
			],
		});
		return 'Handled in Task.ts';
	},
};
