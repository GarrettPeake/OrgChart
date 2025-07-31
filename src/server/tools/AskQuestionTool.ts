import {StreamEvent} from '../../cli/EventStream.js';
import {ToolDefinition} from './index.js';

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
		},
		required: ['question'],
	},
	enact: async (args: {question: string}): Promise<string> => 'Answer',
	formatEvent: async (args: {question: string}): Promise<StreamEvent> => ({
		title: `Question from Agent`,
		content: args.question,
	}),
};
