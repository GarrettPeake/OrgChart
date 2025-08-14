import Logger, {initContextLogger} from '@/Logger.js';
import {agents, toStaticAgentInfo} from './agents/Agents.js';
import {
	AgentStatus,
	Approval,
	OrgchartCommand,
	OrgchartEvent,
	RunningAgentInfo,
	StaticAgentInfo,
	DisplayContentType,
} from './IOTypes.js';
import {TaskAgent} from './tasks/TaskAgent.js';
import {Conversation, ConversationParticipant} from './tasks/Conversation.js';
import {ContinuousContextManager} from './workflows/ContinuousContext.js';
import {CommandRegistry} from './commands/CommandRegistry.js';
import {getConfig} from './utils/Configuration.js';

/**
 * To separate server and UI, we define a "server" based on a promise
 * Upon initialization the server class starts an async process and methods of the
 * class are used to send and receive information from the server.
 *
 * If needed, this promise server could be wrapped or replaced with an HTTP, STDIO, or other
 */
export class PromiseServer {
	private taskAgent?: TaskAgent;
	private userConversation?: Conversation;
	private events: OrgchartEvent[] = [];
	private runId: string = crypto.randomUUID().substring(0, 6);
	private stepInterval: NodeJS.Timeout | null = null;
	private contextManager: ContinuousContextManager;
	private commandRegistry: CommandRegistry;
	private isAgentStarted: boolean = false;
	private isInitialized: boolean = false;
	private commandQueue: OrgchartCommand[] = [];
	private agentOverride?: keyof typeof agents;

	constructor() {
		this.contextManager = new ContinuousContextManager();
		this.commandRegistry = new CommandRegistry();
		this.initialize();
	}

	private async initialize() {
		Logger.info(`Starting server'`);
		try {
			// Wait for context manager to initialize before creating agents
			// await this.contextManager.initialize();
			Logger.info('ContinuousContext initialized successfully');
		} catch (error) {
			Logger.error('Failed to initialize context manager:', error);
		}
		this.isInitialized = true;
		this.commandQueue.forEach(command => this.sendCommand(command));
	}

	private startAgent(agentId: string) {
		if (this.isAgentStarted) {
			return;
		}

		// Create conversation between user and main agent
		this.userConversation = new Conversation();

		this.taskAgent = new TaskAgent(
			this.upsertEvent.bind(this),
			agentId,
			this.userConversation,
			this.contextManager, // Pass context manager to TaskAgent
		);

		initContextLogger(this.runId, this.taskAgent);

		// Start the step interval
		this.stepInterval = setInterval(() => {
			this.taskAgent?.step();
		}, 250);

		this.isAgentStarted = true;
	}

	getRunId() {
		return this.runId;
	}

	getTotalSpend() {
		return getConfig().llmProvider.totalSpend;
	}

	// Capabilities used by agent code
	upsertEvent(event: OrgchartEvent) {
		Logger.info(JSON.stringify(event));
		const replacementIndex = this.events.findIndex(e => e.id === event.id);
		if (replacementIndex !== -1) {
			this.events[replacementIndex] = event;
		} else {
			this.events.push(event);
		}
	}

	// Agent interaction
	async sendCommand(command: OrgchartCommand) {
		if (!this.isInitialized) {
			this.commandQueue.push(command);
			return;
		}

		// Check if it's a command or regular task
		if (this.commandRegistry.isCommand(command)) {
			const commandId = crypto.randomUUID();
			this.upsertEvent({
				id: commandId,
				title: `Command Executing(${command})`,
				content: [],
			});
			// Execute command and emit result as event
			this.commandRegistry
				.executeCommand(command, this)
				.then(result => {
					this.upsertEvent({
						id: commandId,
						title: `Command ${
							result.success ? 'Succeeded' : 'Failed'
						}(${command})`,
						content: [
							{
								type: DisplayContentType.TEXT,
								content: result.message,
							},
						],
					});
				})
				.catch(error => {
					this.upsertEvent({
						id: commandId,
						title: `Command Error(${command})`,
						content: [
							{
								type: DisplayContentType.TEXT,
								content: `Command execution error: ${error.message}`,
							},
						],
					});
				});
		} else {
			// If agent hasn't started yet, start it with the first command
			if (!this.isAgentStarted) {
				Logger.info(`Starting agent with first command: ${command}`);
				this.startAgent(this.agentOverride || getConfig().defaultAgent);
			}
			// Send message through the user conversation
			this.userConversation!.addMessage(
				ConversationParticipant.PARENT,
				command,
			);
		}
	}

	getCommandOptions(prefix: string) {
		if (this.commandRegistry.isCommand(prefix)) {
			return this.commandRegistry.getAvailableCommands(prefix);
		}
		return [];
	}

	getAgentGraph(): RunningAgentInfo | undefined {
		return this.taskAgent?.toRunningAgentInfo();
	}

	getApprovals(): Approval[] {
		return [];
	}

	pause() {
		// Guard against calling before initialization completes
		if (!this.taskAgent) {
			return;
		}

		// Find the currently executing taskRunner
		let node = this.taskAgent;
		while (node.children.length > 0) {
			let nextNode = node.children[node.children.length - 1];
			if (nextNode && nextNode?.status !== AgentStatus.IDLE) {
				node = nextNode;
			}
		}
		node?.pause();
	}

	/**
	 * Get the event stream from the server
	 * @param agentId Enables optionally filtering by agentId
	 * @returns The list of server events
	 */
	getEvents(agentId?: string): OrgchartEvent[] {
		return this.events;
	}

	/**
	 * Stop the server and cleanup resources
	 */
	stop(): void {
		if (this.stepInterval) {
			clearInterval(this.stepInterval);
			this.stepInterval = null;
		}
		this.contextManager.destroy();
	}

	setAgentOverride(agentId: keyof typeof agents) {
		this.agentOverride = agentId;
	}
}

export const getAgentTypes = (): StaticAgentInfo[] => {
	return Object.values(agents).map(e => toStaticAgentInfo(e));
};
