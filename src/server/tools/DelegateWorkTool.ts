import {agents} from '../agents/Agents.js';
import {StreamEvent} from '../../cli/EventStream.js';
import {ToolDefinition} from './index.js';

export const delegateWorkToolName = 'DelegateWork';

const descriptionForAgent = (level: number) => ` 
This tool allows you to delegate a portion of your assigned task to the given agent. The amount and scope of work delegated should be commensurate to the agent's job title, for instance, designing a service is too large for a Junior Engineer and writing unit tests is too small for a Principal or Senior Software engineer.
Please delegate work to the most logical agent and utilize agents as often as possible. If your assigned task is manageable in only a few small steps, you should not delegate. If your assigned task could be broken down into two sets of code changes, it should be broken down and delegated in dependency order.
Agents Ids and their descriptions:
${Object.entries(agents)
	.map(([k, v]) => {
		if (v.level < level) {
			return `* ${k}: ${v.human_description}`;
		} else {
			return undefined;
		}
	})
	.filter(s => s !== undefined)
	.join('\n')}
`;

export const delegateWorkTool = (level: number): ToolDefinition => ({
	name: delegateWorkToolName,
	descriptionForAgent: descriptionForAgent(level),
	inputSchema: {
		type: 'object',
		properties: {
			task: {
				type: 'string',
				description:
					'The description of the work to be delegated. Formulate this such that the agent will not require ANY further clarification of the task and can begin work.',
			},
			agentId: {
				type: 'string',
				description: 'The id of the agent to delegate the task to',
				enum: Object.entries(agents)
					.map(([k, v]) => (v.level < level ? k : undefined))
					.filter(s => s !== undefined),
			},
		},
		required: ['task', 'agentId'],
	},
	enact: async (args: {agentId: string; task: string}): Promise<string> =>
		'Handled in Task.ts',
	formatEvent: async (args: {
		agentId: string;
		task: string;
	}): Promise<StreamEvent> => ({
		title: `Spawn Agent(${agents[args.agentId]})`,
		content: args.task,
	}),
});
