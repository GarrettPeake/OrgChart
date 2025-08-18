import {AgentStatus, DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';
import {Conversation, ConversationParticipant} from '../tasks/Conversation.js';
import {agents} from '../agents/Agents.js';

export const delegateWorkToolName = 'DelegateWork';

const descriptionForAgent = (level: number) => ` 
This tool allows you to delegate a portion of your assigned task to another agent. The amount, type, and scope of work delegated should be commensurate to the agent's job title. For instance:
 * Design tasks should not be given to a Software Engineer but rather a Designer.
 * Designing an entire feature service is too large for a Junior Designer
 * Writing a few unit tests is too small for a Senior Software engineer but if we're making sweeping changes to all tests that's too big for a Junior Software Engineer
You should delegate work to the most logical agent and utilize agents as often as possible. If your assigned task is manageable in only a few small steps, you should not delegate. If your assigned task could be broken down into two sets of code changes, it should be broken down and delegated in dependency order.
Here is a list of agentIds and their descriptions:
${Object.entries(agents)
	.map(([k, v]) => v)
	.filter(a => a.level < level)
	.map(agent => `* ${agent.id}: ${agent.llm_description}`)
	.join('\n')}
`;

export const delegateWorkTool = (level: number): ToolDefinition => {
	return {
		name: delegateWorkToolName,
		descriptionForAgent: descriptionForAgent(level),
		inputSchema: {
			type: 'object',
			properties: {
				reasoning: {
					type: 'string',
					description:
						'A brief explanation (1-2 sentences) of why you are delegating this task and how it fits into the overall work.',
				},
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
			required: ['reasoning', 'task', 'agentId'],
		},
		enact: async (
			args: {reasoning: string; agentId: string; task: string},
			invoker: TaskAgent,
			writeEvent: (event: OrgchartEvent) => void,
			toolCallId?: string,
		): Promise<string> => {
			const eventId = crypto.randomUUID();
			writeEvent({
				title: `DelegateWork(${agents[args.agentId]?.name})`,
				id: eventId,
				content: [
					{
						type: DisplayContentType.TEXT,
						content: args.reasoning,
					},
					{
						type: DisplayContentType.TEXT,
						content: args.task,
					},
				],
			});

			if (!(args.agentId in agents)) {
				writeEvent({
					title: `DelegateWork - Failed`,
					id: eventId,
					content: [
						{
							type: DisplayContentType.TEXT,
							content: args.reasoning,
						},
						{
							type: DisplayContentType.TEXT,
							content: `Failed: Cannot delegate to agent '${args.agentId}' as it does not exist`,
						},
						{
							type: DisplayContentType.TEXT,
							content: args.task,
						},
					],
				});
				return `Cannot delegate to agent '${args.agentId}' as it does not exist`;
			}

			// Create conversation between parent and child
			const conversation = new Conversation();
			// Store the tool call ID so we can match the result later
			conversation.pendingToolCallId = toolCallId;
			// Set the initial message as the task
			conversation.addMessage(ConversationParticipant.PARENT, args.task);

			const childTaskRunner = new TaskAgent(
				writeEvent,
				args.agentId,
				conversation,
				invoker.continuousContextManager,
			);
			invoker.addChild(childTaskRunner, conversation);

			// Set the invoker to WAITING state so it waits for the child to complete
			invoker.status = AgentStatus.WAITING;

			const agent = agents[args.agentId as keyof typeof agents];
			return `Delegated task to ${
				agent?.name || args.agentId
			}. Waiting for completion...`;
		},
	};
};
