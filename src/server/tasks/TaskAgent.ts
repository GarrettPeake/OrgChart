import {Agent, agents, toStaticAgentInfo} from '../agents/Agents.js';
import {delegateWorkTool} from '../tools/DelegateWorkTool.js';
import Logger, {ContextLogger} from '../../Logger.js';
import {
	attemptCompletionToolDefinition,
	attemptCompletionToolName,
} from '../tools/AttemptCompletionTool.js';
import {TodoListItem} from '../tools/UpdateTodoListTool.js';
import {ModelInformation} from '../agents/ModelInfo.js';
import {getConfig} from '../utils/Configuration.js';
import {cleanText} from '@/shared/utils/TextUtils.js';
import {
	CompletionInputMessage,
	CompletionUsageStats,
	ToolCall,
} from '../utils/provider/OpenRouter.js';
import {
	AgentStatus,
	DisplayContentType,
	OrgchartEvent,
	RunningAgentInfo,
} from '../IOTypes.js';
import {ToolDefinition} from '../tools/index.js';

/**
 * Implements a task state machine with the following transitions
 * created -> executing (when task is started)
 * executing -> paused (when interrupted by the user)
 * executing -> exited (when the task is complete)
 * executing -> waiting (when using a tool)
 * waiting -> executing (when tool use is complete)
 * paused -> executing (when resumed by the user)
 * paused -> exited (when killed by the user)
 * exited -> executing (when a new task is received)
 */
export class TaskAgent {
	private writeEvent: (event: OrgchartEvent) => void;
	public agent: Agent;
	public children: TaskAgent[] = [];
	public status: AgentStatus = AgentStatus.CREATED;
	public cost: number = 0.0;
	public contextUsed: number = 0;
	public agentInstanceId: string = crypto.randomUUID();
	public todoList: TodoListItem[] = [];
	// Initialize context with system prompt and user input
	public context: CompletionInputMessage[];
	// Keep track of the task promise being executed
	private shouldStop = false;
	private shouldExit = false;
	private promise: Promise<string> | undefined;
	private tools: ToolDefinition[] = [];

	constructor(
		writeEvent: (event: OrgchartEvent) => void,
		agentId: keyof typeof agents,
	) {
		this.writeEvent = writeEvent;
		this.agent = agents[agentId]!;
		this.context = [
			{
				role: 'system',
				content: this.agent.system_prompt(),
			},
		];
	}

	/**
	 * Add a specific completion input to context with no extra logic
	 * @param message The message to add to the context
	 */
	addToContext(message: CompletionInputMessage) {
		this.context.push(message);
		ContextLogger.getAgentLogger(this.agentInstanceId)();
	}

	/**
	 * Convert this task runner, agent, and children into a frontned ingestable data structure
	 */
	toRunningAgentInfo(): RunningAgentInfo {
		return {
			...toStaticAgentInfo(this.agent),
			cost: this.cost,
			status: this.status,
			contextUsage: this.contextUsed,
			maxContext: ModelInformation[this.agent.model].context,
			children: this.children?.map(it => it.toRunningAgentInfo()),
		};
	}

	/**
	 * Public API to add a child agent
	 * @param childAgent The TaskAgent to add as a child
	 */
	addChild(childAgent: TaskAgent): void {
		this.children.push(childAgent);
	}

	/**
	 * Public API to update the todo list
	 * @param todoList The new todo list
	 */
	updateTodoList(todoList: TodoListItem[]): void {
		this.todoList = todoList;
	}

	/**
	 * Stop the currently executing task ensuring the state is created, exited, or paused
	 * If the agent is mid execution, this will simply cause it to pause
	 * @returns boolean denoting whether there was a task to cancel
	 */
	async stopExecution() {
		this.shouldStop = true;
		// Wait for the main thread to take the pause (bypass if we're in created, exited, or paused already)
		while (
			this.status === AgentStatus.EXECUTING ||
			this.status === AgentStatus.WAITING
		) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		this.shouldStop = false;
	}

	/**
	 * Starts or continues the main task execution
	 * @param input The user message to append to the current context before starting the cycles with the LLM
	 * @returns A task completion message when the LLM has enacted complete task
	 */
	async sendInput(input: string): Promise<string> {
		await this.stopExecution(); // Stop the current execution
		// Append the new message to the context
		if (
			this.status !== AgentStatus.CREATED &&
			this.status !== AgentStatus.EXITED
		) {
			// If this is occuring mid conversation, we should insert an agent acknowledgement of the previous tool result before injecting a user message
			// This prevents the conversation from have two messages in a row from the user/tool which causes the model to ignore one
			this.addToContext({
				role: 'assistant',
				content: "Great, I'll continue working now",
			});
		}
		this.addToContext({
			role: 'user',
			content: cleanText(input),
		});
		this.writeEvent({
			title: `Starting Task - ${this.agent.name}`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: `${input}`,
				},
			],
		});
		if (!this.promise) {
			this.promise = this.startTaskLoop();
			this.promise.then(() => (this.promise = undefined)); // When the task finishes, remove it from the class
		}
		this.status = AgentStatus.EXECUTING; // Set the correct state, if the agent is paused this will restart it
		return this.promise;
	}

	private async executeToolCall(toolCall: ToolCall): Promise<string> {
		const toolName = toolCall.function.name;
		let args: any;

		try {
			args = JSON.parse(toolCall.function.arguments);
		} catch (e) {
			Logger.error(e, `Error parsing tool arguments for ${toolName}`);
			return `Invalid tool use, unable to parse tool arguments: ${e}`;
		}

		try {
			const tool = this.tools.find(i => i.name === toolName);
			if (tool === undefined) {
				return 'Failed to use tool, no tool of that type exists';
			}

			if (toolName === attemptCompletionToolName) {
				return args.result;
			}

			return await tool.enact(args, this, this.writeEvent);
		} catch (e: any) {
			this.writeEvent({
				title: `Failure(${toolName})`,
				id: crypto.randomUUID(),
				content: [
					{
						type: DisplayContentType.TEXT,
						content: `Error: ${e.message}`,
					},
				],
			});
			return `Failed to enact tool ${toolName}, received error: ${e.message}`;
		}
	}

	private updateUsages(usage: CompletionUsageStats) {
		// Update our context usage and cost usage
		this.contextUsed = usage.prompt_tokens;
		this.cost += usage.cost;
		Logger.info(
			`Request ${this.agent.name} ${usage.prompt_tokens}(${usage.prompt_tokens_details.reasoning_tokens}cache) -> ${usage.completion_tokens}`,
		);
	}

	private async startTaskLoop(): Promise<string> {
		try {
			this.tools = this.agent.tools();
			if (this.agent.level > 0) {
				this.tools = this.tools.concat([delegateWorkTool(this.agent.level)]);
			}

			let iterations = 0;
			const maxIterations = getConfig().maxAgentIterations; // Prevent infinite loops

			while (iterations < maxIterations) {
				this.status = AgentStatus.EXECUTING;
				iterations++;

				if (this.shouldStop) {
					this.writeEvent({
						title: `Task execution paused, waiting for input - ${this.agent.name}`,
						id: crypto.randomUUID(),
						content: [],
					});
					this.status = AgentStatus.PAUSED;
					// Pause this agent until an external process modifies it's status, sleeping for 50ms at a time
					while (this.status === AgentStatus.PAUSED) {
						await new Promise(resolve => setTimeout(resolve, 50));
					}
				}

				// On the final iteration, tell the agent that it is being forced to complete the task with the knowledge it already has
				if (iterations === maxIterations - 1) {
					this.addToContext({
						role: 'user',
						content: `You have run out of time and must provide a response to the requester given the information you already have/work you've already completed. If you were unable to finish the task completely, ensure the requester is made aware and you provide enough context for the requester to continue the task where you left off`,
					});
				}

				// Call the LLM
				const response = await getConfig().llmProvider.chatCompletion(
					{
						model: this.agent.model,
						messages: this.context,
						tool_choice: 'required',
						temperature: this.agent.temperature,
						stream: false,
					},
					iterations !== maxIterations - 1 // On the final iteration, only give the model the complete work tool
						? this.tools
						: [attemptCompletionToolDefinition],
				);

				// Update our context usage and cost usage
				if (response.usage) {
					this.updateUsages(response.usage);
				}

				// Extract the information we care about
				const choice = response?.choices?.[0];
				const message = response?.choices?.[0]?.message;

				// Handle the LLM not producing a response
				if (!choice || !message) {
					this.writeEvent({
						title: 'LLM API Error',
						id: crypto.randomUUID(),
						content: [
							{
								type: DisplayContentType.TEXT,
								content: 'No response, retrying',
							},
						],
					});
					continue;
				}
				// Handle API errors
				if (response.id === 'failure') {
					this.writeEvent({
						title: 'LLM API Error',
						id: crypto.randomUUID(),
						content: [
							{
								type: DisplayContentType.TEXT,
								content: choice?.message?.content!,
							},
						],
					});
					// Realistically we just want to pause here
					// TODO: Prompt user for permission to proceed then just infinitely retry
					return 'Failed to continue work due to unforeseen accident'; // This message will be shown to the requesting agent and is meant to sound work-like
				}

				// Add assistant message to context
				this.addToContext({
					role: 'assistant',
					content: '',
					tool_calls: message.tool_calls,
				});

				// Handle tool calls
				if (message.tool_calls && message.tool_calls.length > 0) {
					for (const toolCall of message.tool_calls) {
						this.status = AgentStatus.WAITING;
						const toolResult = await this.executeToolCall(toolCall);
						Logger.info(
							`Agent: ${this.agent.name} used ${
								toolCall.function.name
							} and received ${toolResult.slice(0, 50)}`,
						);

						// Add tool result to context
						this.addToContext({
							role: 'tool',
							content: toolResult,
							tool_call_id: toolCall.id,
						});

						// Check if task is complete
						if (toolCall.function.name === attemptCompletionToolName) {
							this.status = AgentStatus.EXITED;
							return toolResult;
						}
					}
				} else {
					// No tool calls, task might be complete or need clarification
					Logger.warn('LLM provided no tool calls');
					throw 'No Tool Calls';
				}
			}
			this.writeEvent({
				title: `Agent Max Cycles Exceeded (${maxIterations})`,
				id: crypto.randomUUID(),
				content: [
					{
						type: DisplayContentType.TEXT,
						content: 'Please instruct the agent to continue or correct it',
					},
				],
			});
			Logger.info('Loop detected, the user will need to manually continue');
			return `Forced to stop work after after ${maxIterations} turns`;
		} catch (error) {
			this.status = AgentStatus.EXITED;
			Logger.error(error, 'Task execution failed');
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			this.writeEvent({
				title: 'Task Error',
				id: crypto.randomUUID(),
				content: [
					{
						type: DisplayContentType.TEXT,
						content: errorMessage,
					},
				],
			});
			return errorMessage;
		}
	}
}
