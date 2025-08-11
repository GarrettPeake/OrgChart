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
	// Step-based execution state
	private iterationCount: number = 0;
	private isLLMCallInProgress = false;
	private isToolCallInProgress = false;
	private currentToolCalls: ToolCall[] = [];
	private currentToolIndex = 0;
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
	 * Pause the currently executing task by setting state to PAUSED
	 */
	pause(): void {
		if (
			this.status === AgentStatus.THINKING ||
			this.status === AgentStatus.ACTING
		) {
			this.status = AgentStatus.PAUSED;
		}
	}

	/**
	 * Resume execution from PAUSED state
	 */
	resume(): void {
		if (this.status === AgentStatus.PAUSED) {
			// Resume to appropriate state based on what was interrupted
			if (this.isLLMCallInProgress) {
				this.status = AgentStatus.THINKING;
			} else if (this.isToolCallInProgress) {
				this.status = AgentStatus.ACTING;
			} else {
				this.status = AgentStatus.THINKING; // Default to thinking for next iteration
			}
		}
	}

	/**
	 * Add user input to context and transition to THINKING state
	 * @param input The user message to append to the current context
	 */
	sendInput(input: string): void {
		// Append the new message to the context
		if (
			this.status !== AgentStatus.CREATED &&
			this.status !== AgentStatus.IDLE
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

		// Initialize tools for this agent
		this.tools = this.agent.tools();
		if (this.agent.level > 0) {
			this.tools = this.tools.concat([delegateWorkTool(this.agent.level)]);
		}

		// Reset iteration count and transition to THINKING
		this.iterationCount = 0;
		this.status = AgentStatus.THINKING;
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

	/**
	 * Execute one step of the agent's state machine
	 */
	step(): void {
		// First, step all children
		this.children.forEach(child => child.step());

		// Handle current state
		switch (this.status) {
			case AgentStatus.CREATED:
			case AgentStatus.IDLE:
			case AgentStatus.PAUSED:
				return;

			case AgentStatus.THINKING:
				this.stepThinking();
				break;

			case AgentStatus.ACTING:
				this.stepActing();
				break;

			case AgentStatus.WAITING:
				this.stepWaiting();
				break;
		}
	}

	private stepThinking(): void {
		// Check if we've hit the iteration limit
		const maxIterations = getConfig().maxAgentIterations;
		if (this.iterationCount >= maxIterations) {
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
			this.status = AgentStatus.IDLE;
			return;
		}

		// Don't start new LLM call if one is in progress
		if (this.isLLMCallInProgress) {
			return;
		}

		this.isLLMCallInProgress = true;
		this.iterationCount++;

		// On the final iteration, tell the agent that it is being forced to complete the task
		if (this.iterationCount === maxIterations) {
			this.addToContext({
				role: 'user',
				content: `You have run out of time and must provide a response to the requester given the information you already have/work you've already completed. If you were unable to finish the task completely, ensure the requester is made aware and you provide enough context for the requester to continue the task where you left off`,
			});
		}

		// Make LLM call
		const toolsToUse =
			this.iterationCount < maxIterations
				? this.tools
				: [attemptCompletionToolDefinition];

		getConfig()
			.llmProvider.chatCompletion(
				{
					model: this.agent.model,
					messages: this.context,
					tool_choice: 'required',
					temperature: this.agent.temperature,
					stream: false,
				},
				toolsToUse,
			)
			.then(response => {
				this.isLLMCallInProgress = false;

				// Check if we were paused during the LLM call
				if (this.status === AgentStatus.PAUSED) {
					return;
				}

				try {
					this.processLLMResponse(response);
				} catch (error) {
					this.handleError(error);
				}
			})
			.catch(error => {
				this.isLLMCallInProgress = false;
				if (this.status !== AgentStatus.PAUSED) {
					this.handleError(error);
				}
			});
	}

	private processLLMResponse(response: any): void {
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
			// Stay in THINKING state to retry
			return;
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
			this.status = AgentStatus.IDLE;
			return;
		}

		// Add assistant message to context
		this.addToContext({
			role: 'assistant',
			content: '',
			tool_calls: message.tool_calls,
		});

		// Handle tool calls
		if (message.tool_calls && message.tool_calls.length > 0) {
			this.currentToolCalls = message.tool_calls;
			this.currentToolIndex = 0;
			this.status = AgentStatus.ACTING;
		} else {
			// No tool calls, task might be complete or need clarification
			Logger.warn('LLM provided no tool calls');
			this.handleError('No Tool Calls');
		}
	}

	private stepActing(): void {
		// Don't start new tool call if one is in progress
		if (this.isToolCallInProgress) {
			return;
		}

		// Check if we have more tools to execute
		if (this.currentToolIndex >= this.currentToolCalls.length) {
			// All tools executed, go back to thinking
			this.status = AgentStatus.THINKING;
			return;
		}

		const toolCall = this.currentToolCalls[this.currentToolIndex];
		if (!toolCall) {
			// No tool call at current index, go back to thinking
			this.status = AgentStatus.THINKING;
			return;
		}

		this.isToolCallInProgress = true;

		this.executeToolCall(toolCall)
			.then(toolResult => {
				this.isToolCallInProgress = false;

				// Check if we were paused during the tool call
				if (this.status === AgentStatus.PAUSED) {
					return;
				}

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
					this.status = AgentStatus.IDLE;
					return;
				}

				// Move to next tool
				this.currentToolIndex++;
			})
			.catch(error => {
				this.isToolCallInProgress = false;
				if (this.status !== AgentStatus.PAUSED) {
					this.handleError(error);
				}
			});
	}

	private stepWaiting(): void {
		// Check if all children are complete
		const activeChildren = this.children.filter(
			child =>
				child.status !== AgentStatus.IDLE &&
				child.status !== AgentStatus.CREATED,
		);

		if (activeChildren.length === 0) {
			// All children are done, transition back to thinking
			this.status = AgentStatus.THINKING;
		}
	}

	private handleError(error: any): void {
		this.status = AgentStatus.PAUSED;
		Logger.error(error, 'Task execution failed');
		const errorMessage = error instanceof Error ? error.message : String(error);
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
	}
}
