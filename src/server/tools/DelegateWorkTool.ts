import {agents} from '../agents/Agents.js';
import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';

export const delegateWorkToolName = 'DelegateWork';

const descriptionForAgent = (level: number) => ` 
This tool allows you to delegate a portion of your assigned task to another agent. The amount, type, and scope of work delegated should be commensurate to the agent's job title. For instance:
 * Design tasks should not be given to a Software Engineer but rather a Designer.
 * Designing an entire feature service is too large for a Junior Designer
 * Writing a few unit tests is too small for a Senior Software engineer but if we're making sweeping changes to all tests that's too big for a Junior Software Engineer
You should delegate work to the most logical agent and utilize agents as often as possible. If your assigned task is manageable in only a few small steps, you should not delegate. If your assigned task could be broken down into two sets of code changes, it should be broken down and delegated in dependency order.
Here is a list of agentIds and their descriptions:
${Object.entries(agents)
	.map(([k, v]) => {
		if (v.level < level) {
			return `* ${k}: ${v.llm_description}`;
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
	enact: async (args: {agentId: string; task: string}, invoker: TaskAgent, writeEvent: (event: OrgchartEvent) => void): Promise<string> => {
		writeEvent({
			title: `Spawn Agent(${agents[args.agentId]})`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.task,
				},
			],
		});

		if (!(args.agentId in agents)) {
			return `Delegation failure - agent '${args.agentId}' not found`;
		}

		const childTaskRunner = new (await import('../tasks/TaskAgent.js')).TaskAgent(writeEvent, args.agentId);
		invoker.addChild(childTaskRunner);
		return childTaskRunner.sendInput(args.task);
	},
});
