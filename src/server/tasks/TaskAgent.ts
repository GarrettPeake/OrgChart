import {Agent, agents, toStaticAgentInfo} from '../agents/Agents.js';
import ServerLogger from '@server/dependencies/Logger.js';
import {
	attemptCompletionToolDefinition,
	attemptCompletionToolName,
} from '../tools/AttemptCompletionTool.js';
import {TodoListItem} from '../tools/UpdateTodoListTool.js';
import {ModelInformation} from '@server/dependencies/provider/ModelInfo.js';
import {OrgchartConfig} from '@server/dependencies/Configuration.js';
import {
	CompletionInputMessage,
	CompletionUsageStats,
	ToolCall,
} from '@server/dependencies/provider/OpenRouter.js';
import {
	AgentStatus,
	DisplayContentType,
	OrgchartEvent,
	RunningAgentInfo,
} from '../IOTypes.js';
import {ToolDefinition} from '../tools/index.js';
import {Conversation, ConversationParticipant} from './Conversation.js';
import {AgentContext} from './AgentContext.js';
import {ContinuousContextManager} from '../workflows/ContinuousContext.js';
import {LLMProvider} from '../dependencies/provider/index.js';

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
	public readonly agent: Agent;
	public children: TaskAgent[] = [];
	public status: AgentStatus = AgentStatus.IDLE;
	public cost: number = 0.0;
	public contextUsed: number = 0;
	public agentInstanceId: string = crypto.randomUUID();
	public todoList: TodoListItem[] = [];
	// Smart context management using blocks
	public readonly agentContext: AgentContext;
	// Step-based execution state
	private iterationCount: number = 0;
	private isLLMCallInProgress = false;
	private isToolCallInProgress = false;
	private currentToolCalls: ToolCall[] = [];
	private currentToolIndex = 0;
	private tools: ToolDefinition[] = [];
	// Conversation management
	public parentConversation: Conversation;
	public childConversations: Map<TaskAgent, Conversation> = new Map();
	// Context management
	public readonly continuousContextManager: ContinuousContextManager;

	constructor(
		writeEvent: (event: OrgchartEvent) => void,
		agentId: keyof typeof agents,
		parentConversation: Conversation,
		continuousContextManager: ContinuousContextManager,
	) {
		this.writeEvent = writeEvent;
		this.agent = agents[agentId]!;
		this.tools = this.agent.tools();
		this.parentConversation = parentConversation;
		this.continuousContextManager = continuousContextManager;

		// Initialize AgentContext with ContinuousContextManager
		this.agentContext = new AgentContext(
			[],
			continuousContextManager,
			this.agentInstanceId,
		);
		this.agentContext.addSystemBlock(this.agent.system_prompt());

		// Seed the context with current project context if available
		if (continuousContextManager) {
			const currentContext =
				continuousContextManager.getCurrentContextContent();
			if (currentContext) {
				this.agentContext.addContextBlock(currentContext);
			}
		}
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
	addChild(childAgent: TaskAgent, conversation: Conversation): void {
		this.children.push(childAgent);
		this.childConversations.set(childAgent, conversation);
	}

	/**
	 * Create a child TaskAgent with the same ContinuousContextManager
	 */
	createChildAgent(
		agentId: keyof typeof agents,
		parentConversation: Conversation,
	): TaskAgent {
		return new TaskAgent(
			this.writeEvent,
			agentId,
			parentConversation,
			this.continuousContextManager,
		);
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
	 * Send a message to parent through conversation
	 */
	private sendMessageToParent(message: string): void {
		// Since this agent is the child, it sends message as CHILD
		this.parentConversation.addMessage(ConversationParticipant.CHILD, message);
	}

	/**
	 * Send a message to a child through conversation
	 */
	private sendMessageToChild(child: TaskAgent, message: string): void {
		const conversation = this.childConversations.get(child);
		if (conversation) {
			// Since this agent is the parent, it sends message as PARENT
			conversation.addMessage(ConversationParticipant.PARENT, message);
		}
	}

	/**
	 * Check for messages from parent conversation and handle them
	 */
	private checkParentConversation(): void {
		if (this.parentConversation.hasMessage(ConversationParticipant.PARENT)) {
			const message = this.parentConversation.takeMessage(
				ConversationParticipant.PARENT,
			);
			if (message) {
				// Prevent the conversation from having two messages in a row from the user/tool which can cause the model to ignore one
				const currentBlocks = this.agentContext.getBlocks();
				const lastBlock = currentBlocks[currentBlocks.length - 1]!;
				const lastMessage = lastBlock.messages[lastBlock.messages.length - 1]!;
				if (lastMessage.role === 'tool' || lastMessage.role === 'user') {
					this.agentContext.addAssistantBlock(
						'Do you have any further input before I continue?',
					);
				}

				// Append the new message to the context
				this.agentContext.addParentBlock(message.content);
				this.writeEvent({
					title: `Starting Task - ${this.agent.name}`,
					id: crypto.randomUUID(),
					content: [
						{
							type: DisplayContentType.TEXT,
							content: `${message.content}`,
						},
					],
				});

				// Reset iteration count and transition to THINKING
				this.iterationCount = 0;
				this.status = AgentStatus.THINKING;
			}
		}
	}

	private async executeToolCall(toolCall: ToolCall): Promise<string> {
		const toolName = toolCall.function.name;
		let args: any;

		try {
			args = JSON.parse(toolCall.function.arguments);
		} catch (e) {
			ServerLogger.error(e, `Error parsing tool arguments for ${toolName}`);
			return `Invalid tool use, unable to parse tool arguments: ${e}`;
		}

		try {
			const tool = this.tools.find(i => i.name === toolName);
			if (tool === undefined) {
				return 'Failed to use tool, no tool of that type exists';
			}

			return await tool.enact(args, this, this.writeEvent, toolCall.id);
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
			return `Error: ${e.message}`;
		}
	}

	private updateUsages(usage: CompletionUsageStats) {
		// Update our context usage and cost usage
		this.contextUsed = usage.prompt_tokens;
		this.cost += usage.cost;
		ServerLogger.info(
			`Request ${this.agent.name} ${usage.prompt_tokens}(${usage.prompt_tokens_details.reasoning_tokens}cache) -> ${usage.completion_tokens}`,
		);
	}

	/**
	 * Get the current context as CompletionInputMessage array for compatibility
	 */
	getContext(): CompletionInputMessage[] {
		return this.agentContext.toCompletionMessages();
	}

	/**
	 * Execute one step of the agent's state machine
	 */
	step(): void {
		// First, step all children
		this.children.forEach(child => child.step());

		// Handle current state
		switch (this.status) {
			case AgentStatus.IDLE:
				// Check for parent messages in IDLE state
				this.checkParentConversation();
				break;

			case AgentStatus.PAUSED:
				// Check for parent messages in paused state
				this.checkParentConversation();
				return;

			case AgentStatus.THINKING:
				this.stepThinking();
				break;

			case AgentStatus.ACTING:
				this.stepActing();
				break;

			case AgentStatus.WAITING:
				// Check for child messages in WAITING state
				this.checkChildConversations();
				this.stepWaiting();
				break;
		}
	}

	/**
	 * Check for messages from child conversations and handle them
	 */
	private checkChildConversations(): void {
		for (const [child, conversation] of this.childConversations.entries()) {
			if (conversation.hasMessage(ConversationParticipant.CHILD)) {
				const message = conversation.takeMessage(ConversationParticipant.CHILD);
				if (message && conversation.pendingToolCallId) {
					// Update the pending tool result in the context
					this.agentContext.updateToolBlockResult(
						conversation.pendingToolCallId,
						message.content,
					);

					// Clear the pending tool call
					conversation.pendingToolCallId = undefined;

					// Transition to thinking to continue processing
					this.status = AgentStatus.THINKING;
					break; // Only process one child result per step
				}
			}
		}
	}

	private stepThinking(): void {
		// Check if we've hit the iteration limit and pause the agent
		const maxIterations = OrgchartConfig.maxAgentIterations;
		if (this.iterationCount >= maxIterations) {
			this.status = AgentStatus.PAUSED;
			this.writeEvent({
				title: `Agent exceeded max loops (${maxIterations})`,
				id: crypto.randomUUID(),
				content: [
					{
						type: DisplayContentType.TEXT,
						content: 'Agent paused, send input to resume',
					},
				],
			});
			ServerLogger.info(
				'Loop detected, the user will need to manually continue',
			);
			this.status = AgentStatus.PAUSED;
			return;
		}

		// Don't start new LLM call if one is in progress
		if (this.isLLMCallInProgress) {
			return;
		}

		this.isLLMCallInProgress = true;
		this.iterationCount++;

		LLMProvider.chatCompletion(
			{
				model: this.agent.model,
				messages: this.agentContext.toCompletionMessages(),
				tool_choice: 'required',
				temperature: this.agent.temperature,
				stream: false,
			},
			this.tools,
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
				// Handle the error unless agent was paused, in which case we ignore it
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
		const message = choice?.message;

		// Handle the LLM not producing a response
		if (!choice || !message) {
			ServerLogger.info(response);
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

		// Handle tool calls - create pending tool blocks for each one
		if (message.tool_calls && message.tool_calls.length > 0) {
			this.currentToolCalls = message.tool_calls;

			// Create pending tool blocks for each tool call
			for (const toolCall of message.tool_calls) {
				this.agentContext.addPendingToolBlock(toolCall);
			}

			this.currentToolIndex = 0;
			this.status = AgentStatus.ACTING;
		} else {
			// No tool calls, task might be complete or need clarification
			ServerLogger.warn('LLM provided no tool calls');
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

				ServerLogger.info(
					`Agent: ${this.agent.name} used ${
						toolCall.function.name
					} and received ${toolResult.slice(0, 50)}`,
				);

				// Update the pending tool block with the actual result
				this.agentContext.updateToolBlockResult(toolCall.id, toolResult);

				// Check if task is complete
				if (toolCall.function.name === attemptCompletionToolName) {
					// Trigger context update when task is completed
					this.triggerContextUpdate();
					// Send completion message to parent if we have a parent conversation
					this.sendMessageToParent(toolResult);
					this.status = AgentStatus.IDLE;
					return;
				}

				// Check if this was a delegate work tool - if so, trigger context update
				if (toolCall.function.name === 'delegate_work') {
					this.triggerContextUpdate();
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
			child => child.status !== AgentStatus.IDLE,
		);
		if (activeChildren.length === 0) {
			// All children are done, refresh context and transition back to thinking
			// this.refreshProjectContext();
			this.status = AgentStatus.THINKING;
		}
	}

	/**
	 * Refresh the project context from the ContinuousContextManager
	 */
	private refreshProjectContext(): void {
		if (this.continuousContextManager) {
			this.agentContext.refreshContextBlock();
			ServerLogger.info(`Agent ${this.agent.name} refreshed project context`);
		}
	}

	/**
	 * Trigger a context update when significant work is completed
	 */
	private triggerContextUpdate(): void {
		if (this.continuousContextManager) {
			this.continuousContextManager.updateContext().catch(error => {
				ServerLogger.error('Failed to update continuous context:', error);
			});
			ServerLogger.info(`Agent ${this.agent.name} triggered context update`);
		}
	}

	private handleError(error: any): void {
		this.status = AgentStatus.PAUSED;
		ServerLogger.error(error, 'Task execution failed');
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
