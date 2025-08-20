import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';

export const attemptCompletionToolName = 'AttemptCompletion';

const descriptionForAgent = `This tool is used to let the requester know that the work has been completed. You should provide a concise message for the requester through the "short_completion_message" parameter and detailed information through the "completion_details" parameter.
You should attempt to accomplish all components of the requested task before using this tool.
IMPORTANT NOTE: This tool CANNOT be used until you've used at least one other tool prior. Failure to do so will result in code corruption and system failure.`;

export const attemptCompletionToolDefinition: ToolDefinition = {
	name: attemptCompletionToolName,
	descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			completion_message: {
				type: 'string',
				description:
					"The results of your work shown to the requester -- should be concise and user-friendly without leaving out any of the information requested. Note that from your requester's perspective, they only see the task you give them, and this message -- none of the other work you performed is shown.",
			},
			completion_details: {
				type: 'string',
				description:
					'Detailed internal information that the requester will NOT see. Include: 1) Assumptions - any assumptions made about the intent of the task, 2) Decisions - decisions which could affect future work such as adding dependencies, changing code signatures, or removing files, 3) Limitations - unforeseen issues which required you to reasonably expand the scope of your assigned task, 4) Mutations - describe all mutating operations performed to complete your task (including mutations made by other agents), 5) Results - detailed description of what was accomplished, state mutations made to the project, code signatures of new functions, etc. Do not include actual code content but outline modifications through descriptive wording.',
			},
		},
		required: ['completion_message', 'completion_details'],
	},
	enact: async (
		args: {completion_message: string; completion_details: string},
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	): Promise<string> => {
		writeEvent({
			title: 'Task Complete',
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.completion_message,
				},
			],
		});
		return `${args.completion_message}\n\n${args.completion_details}`;
	},
};
