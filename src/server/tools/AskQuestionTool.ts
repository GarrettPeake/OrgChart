import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';

export const askQuestionToolName = 'AskQuestion';

const descriptionForAgent = `Ask the user a question to gather additional information needed to complete the task. This tool should be used when you encounter ambiguities, need clarification, or require more details to proceed effectively. It allows for interactive problem-solving by enabling direct communication with the user. Use this tool judiciously to maintain a balance between gathering necessary information and avoiding excessive back-and-forth.`;

export const askQuestionToolDefinition: ToolDefinition = {
	name: askQuestionToolName,
	descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			question: {
				type: 'string',
				description:
					'The question to ask the user. This should be a clear, specific question that addresses the information you need.',
			},
			reasoning: {
				type: 'string',
				description:
					'A brief explanation (1-2 sentences) of why you need to ask this question and how it will help accomplish the task.',
			},
		},
		required: ['question', 'reasoning'],
	},
	enact: async (
		args: {question: string; reasoning: string},
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	): Promise<string> => {
		writeEvent({
			title: `Question from Agent`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.reasoning,
				},
				{
					type: DisplayContentType.TEXT,
					content: args.question,
				},
			],
		});
		return 'Answer';
	},
};
