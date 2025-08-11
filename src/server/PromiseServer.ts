import Logger, {initContextLogger} from '@/Logger.js';
import {agents, toStaticAgentInfo} from './agents/Agents.js';
import {
	AgentStatus,
	Approval,
	CommandType,
	OrgchartCommand,
	OrgchartEvent,
	RunningAgentInfo,
	StaticAgentInfo,
} from './IOTypes.js';
import {TaskAgent} from './tasks/TaskAgent.js';

/**
 * To separate server and UI, we define a "server" based on a promise
 * Upon initialization the server class starts an async process and methods of the
 * class are used to send and receive information from the server.
 *
 * If needed, this promise server could be wrapped or replaced with an HTTP, STDIO, or other
 */
export class PromiseServer {
	private taskAgent: TaskAgent;
	private events: OrgchartEvent[] = [];
	private runId: string = crypto.randomUUID();
	private stepInterval: NodeJS.Timeout | null = null;

	constructor(agentId: keyof typeof agents, initialTask: string) {
		// TODO initialize logger
		// TODO initialize config
		Logger.info(
			`Starting server with agent ${agentId} and task '${initialTask}'`,
		);
		this.taskAgent = new TaskAgent(this.upsertEvent.bind(this), agentId);
		initContextLogger(this.runId, this.taskAgent);
		this.taskAgent.sendInput(initialTask);

		// Start the step interval
		this.stepInterval = setInterval(() => {
			this.taskAgent.step();
		}, 250);
	}

	getRunId() {
		return this.runId;
	}

	// Capabilities used by agent code
	upsertEvent(event: OrgchartEvent) {
		Logger.info(JSON.stringify(event));
		this.events.push(event);
	}

	getApproval(event: OrgchartEvent) {}

	// Agent interaction
	sendCommand(command: OrgchartCommand) {
		// Add the command as a task to either the root agent or the currently executing agent
		// Find the currently executing taskRunner
		let node = this.taskAgent;
		while (node.children.length > 0) {
			let nextNode = node.children[node.children.length - 1];
			if (
				nextNode &&
				nextNode?.status !== AgentStatus.IDLE &&
				nextNode?.status !== AgentStatus.CREATED
			) {
				node = nextNode;
			}
		}
		// Act on the command based on type
		switch (command.type) {
			case CommandType.TASK:
				node.sendInput(command.task);
				break;
			case CommandType.APPROVE:
				break;
			default:
				break;
		}
	}

	getCommandOptions() {}

	getAgentGraph(): RunningAgentInfo {
		return this.taskAgent.toRunningAgentInfo();
	}

	getApprovals(): Approval[] {
		return [];
	}

	pause() {
		// Find the currently executing taskRunner
		let node = this.taskAgent;
		while (node.children.length > 0) {
			let nextNode = node.children[node.children.length - 1];
			if (
				nextNode &&
				nextNode?.status !== AgentStatus.IDLE &&
				nextNode?.status !== AgentStatus.CREATED
			) {
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
	}
}

export const getAgentTypes = (): StaticAgentInfo[] => {
	return Object.values(agents).map(e => toStaticAgentInfo(e));
};
