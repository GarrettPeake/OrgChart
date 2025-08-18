import {
	describe,
	it,
	expect,
	beforeEach,
	vi,
	type MockedFunction,
} from 'vitest';
import {TaskAgent} from '@/server/tasks/TaskAgent.js';
import {
	Conversation,
	ConversationParticipant,
} from '@/server/tasks/Conversation.js';
import {
	AgentStatus,
	DisplayContentType,
	OrgchartEvent,
} from '@/server/IOTypes.js';
import {OrgchartConfig} from '@server/dependencies/Configuration.js';
import {
	CompletionUsageStats,
	ToolCall,
} from '@server/dependencies/provider/OpenRouter.js';
import {attemptCompletionToolName} from '@/server/tools/AttemptCompletionTool.js';
import {ContinuousContextManager} from '@/server/workflows/ContinuousContext.js';
import ServerLogger from '@server/dependencies/Logger.js';

// Mock all dependencies
vi.mock('@server/dependencies/Logger.js', () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
	ContextLogger: {
		getAgentLogger: vi
			.fn()
			.mockReturnValue(vi.fn().mockResolvedValue(undefined)),
	},
}));

vi.mock('@server/dependencies/Configuration.js', () => ({
	OrgchartConfig: vi.fn(),
}));

vi.mock('@/shared/utils/TextUtils.js', () => ({
	cleanText: vi.fn().mockImplementation((text: string) => text.trim()),
}));

vi.mock('@/server/agents/Agents.js', () => ({
	agents: {
		'test-agent': {
			id: 'test-agent',
			name: 'Test Agent',
			description: 'A test agent for unit testing',
			model: 'test-model',
			level: 5,
			temperature: 0.7,
			system_prompt: () => 'You are a test agent.',
			tools: () => [],
		},
		'child-agent': {
			id: 'child-agent',
			name: 'Child Agent',
			description: 'A child test agent',
			model: 'test-model',
			level: 0,
			temperature: 0.5,
			system_prompt: () => 'You are a child test agent.',
			tools: () => [],
		},
	},
	toStaticAgentInfo: vi.fn().mockImplementation((agent: any) => ({
		id: agent.id,
		name: agent.name,
		description: agent.description,
	})),
}));

vi.mock('@/server/tools/DelegateWorkTool.js', () => ({
	delegateWorkTool: vi.fn().mockReturnValue({
		name: 'delegate_work',
		enact: vi.fn(),
	}),
}));

vi.mock('@server/dependencies/provider/ModelInfo.js', () => ({
	ModelInformation: {
		'test-model': {
			context: 8192,
		},
	},
}));

vi.mock('@/server/workflows/ContinuousContext.js', () => ({
	ContinuousContextManager: vi.fn().mockImplementation(() => ({
		getCurrentContextContent: vi.fn().mockReturnValue('Mock project context'),
		updateContext: vi.fn().mockResolvedValue(undefined),
		refreshContextBlock: vi.fn(),
	})),
}));

// Mock tool definitions
const mockTool = {
	name: 'mock_tool',
	enact: vi.fn(),
};

const mockAttemptCompletionTool = {
	name: attemptCompletionToolName,
	enact: vi.fn(),
};

// Helper functions
const createMockToolCall = (
	id: string,
	name: string,
	args: any = {},
): ToolCall => ({
	id,
	type: 'function',
	function: {
		name,
		arguments: JSON.stringify(args),
	},
});

const createMockLLMResponse = (
	toolCalls: ToolCall[] = [],
	usage?: CompletionUsageStats,
) => ({
	choices: [
		{
			message: {
				content: '',
				tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
			},
		},
	],
	usage: usage || {
		prompt_tokens: 100,
		completion_tokens: 50,
		total_tokens: 150,
		cost: 0.001,
		prompt_tokens_details: {reasoning_tokens: 0},
	},
});

describe('TaskAgent', () => {
	let taskAgent: TaskAgent;
	let mockWriteEvent: MockedFunction<(event: OrgchartEvent) => void>;
	let mockParentConversation: Conversation;
	let mockLLMProvider: any;
	let mockConfig: any;
	let mockContinuousContextManager: ContinuousContextManager;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock configuration
		mockLLMProvider = {
			chatCompletion: vi.fn().mockResolvedValue(createMockLLMResponse()),
		};

		mockConfig = {
			maxAgentIterations: 10,
			llmProvider: mockLLMProvider,
		};

		(OrgchartConfig as MockedFunction<typeof OrgchartConfig>).mockReturnValue(
			mockConfig,
		);

		// Setup mock event writer
		mockWriteEvent = vi.fn();

		// Setup mock parent conversation
		mockParentConversation = new Conversation();

		// Setup mock continuous context manager
		mockContinuousContextManager = new ContinuousContextManager();

		// Create TaskAgent instance
		taskAgent = new TaskAgent(
			mockWriteEvent,
			'test-agent',
			mockParentConversation,
			mockContinuousContextManager,
		);
	});

	describe('constructor and initialization', () => {
		it('should initialize with correct properties', () => {
			expect(taskAgent.agent.id).toBe('test-agent');
			expect(taskAgent.status).toBe(AgentStatus.IDLE);
			expect(taskAgent.cost).toBe(0);
			expect(taskAgent.contextUsed).toBe(0);
			expect(taskAgent.children).toEqual([]);
			expect(taskAgent.todoList).toEqual([]);
			expect(taskAgent.agentInstanceId).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			);
		});

		it('should initialize AgentContext with system prompt and context block', () => {
			const context = taskAgent.getContext();
			expect(context).toHaveLength(2); // System + Context user message
			expect(context[0]).toEqual({
				role: 'system',
				content: 'You are a test agent.',
			});
			expect(context[1]).toEqual({
				role: 'user',
				content: 'Mock project context',
			});
			expect(context[2]).toEqual({
				role: 'assistant',
				content:
					'I understand the current project context and will use this information to assist effectively.',
			});
		});

		it('should store parent conversation reference', () => {
			expect(taskAgent.parentConversation).toBe(mockParentConversation);
		});
	});

	describe('public API methods', () => {
		describe('toRunningAgentInfo', () => {
			it('should return correct agent info structure', () => {
				taskAgent.cost = 0.05;
				taskAgent.contextUsed = 500;

				const info = taskAgent.toRunningAgentInfo();

				expect(info).toEqual({
					id: 'test-agent',
					name: 'Test Agent',
					description: 'A test agent for unit testing',
					cost: 0.05,
					status: AgentStatus.IDLE,
					contextUsage: 500,
					maxContext: 8192,
					children: [],
				});
			});

			it('should include children information', () => {
				const childAgent = new TaskAgent(
					mockWriteEvent,
					'child-agent',
					new Conversation(),
					mockContinuousContextManager,
				);
				const childConversation = new Conversation();
				taskAgent.addChild(childAgent, childConversation);

				const info = taskAgent.toRunningAgentInfo();
				expect(info.children).toHaveLength(1);
				expect(info.children![0]!.id).toBe('child-agent');
			});
		});

		describe('addChild', () => {
			it('should add child agent and conversation', () => {
				const childAgent = new TaskAgent(
					mockWriteEvent,
					'child-agent',
					new Conversation(),
					mockContinuousContextManager,
				);
				const childConversation = new Conversation();

				taskAgent.addChild(childAgent, childConversation);

				expect(taskAgent.children).toHaveLength(1);
				expect(taskAgent.children[0]).toBe(childAgent);
				expect(taskAgent.childConversations.get(childAgent)).toBe(
					childConversation,
				);
			});
		});

		describe('updateTodoList', () => {
			it('should update the todo list', () => {
				const todos = [
					{id: '1', content: 'Task 1', completed: false},
					{id: '2', content: 'Task 2', completed: true},
				];

				taskAgent.updateTodoList(todos as any);
				expect(taskAgent.todoList).toBe(todos);
			});
		});
	});

	describe('pause and resume functionality', () => {
		it('should pause when in THINKING state', () => {
			taskAgent.status = AgentStatus.THINKING;

			taskAgent.pause();

			expect(taskAgent.status).toBe(AgentStatus.PAUSED);
		});

		it('should pause when in ACTING state', () => {
			taskAgent.status = AgentStatus.ACTING;

			taskAgent.pause();

			expect(taskAgent.status).toBe(AgentStatus.PAUSED);
		});

		it('should not pause when in IDLE state', () => {
			taskAgent.status = AgentStatus.IDLE;

			taskAgent.pause();

			expect(taskAgent.status).toBe(AgentStatus.IDLE);
		});

		it('should not pause when in WAITING state', () => {
			taskAgent.status = AgentStatus.WAITING;

			taskAgent.pause();

			expect(taskAgent.status).toBe(AgentStatus.WAITING);
		});

		describe('resume', () => {
			it('should resume to THINKING when LLM call was in progress', () => {
				taskAgent.status = AgentStatus.PAUSED;
				(taskAgent as any).isLLMCallInProgress = true;

				taskAgent.resume();

				expect(taskAgent.status).toBe(AgentStatus.THINKING);
			});

			it('should resume to ACTING when tool call was in progress', () => {
				taskAgent.status = AgentStatus.PAUSED;
				(taskAgent as any).isToolCallInProgress = true;

				taskAgent.resume();

				expect(taskAgent.status).toBe(AgentStatus.ACTING);
			});

			it('should resume to THINKING by default', () => {
				taskAgent.status = AgentStatus.PAUSED;

				taskAgent.resume();

				expect(taskAgent.status).toBe(AgentStatus.THINKING);
			});

			it('should not resume when not paused', () => {
				taskAgent.status = AgentStatus.IDLE;

				taskAgent.resume();

				expect(taskAgent.status).toBe(AgentStatus.IDLE);
			});
		});
	});

	describe('parent-child communication', () => {
		it('should handle parent messages when IDLE', () => {
			const message = {
				content: 'Start working on this task',
				timestamp: Date.now(),
			};
			mockParentConversation.addMessage(
				ConversationParticipant.PARENT,
				'Start working on this task',
			);

			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.THINKING);
			expect(mockWriteEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Starting Task - Test Agent',
					content: expect.arrayContaining([
						expect.objectContaining({
							type: DisplayContentType.TEXT,
							content: 'Start working on this task',
						}),
					]),
				}),
			);
		});

		it('should add acknowledgment when receiving parent message mid-conversation', async () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 1; // Prevent LLM call
			(taskAgent as any).isLLMCallInProgress = true; // Prevent new LLM call

			mockParentConversation.addMessage(
				ConversationParticipant.PARENT,
				'Continue with next step',
			);

			taskAgent.step();

			// Should have added assistant acknowledgment block
			const contextBlocks = taskAgent.agentContext.getBlocks();
			const assistantBlocks = contextBlocks.filter(b => b.type === 'ASSISTANT');
			expect(
				assistantBlocks.some(
					b => b.messages[0]?.content === "Great, I'll continue working now",
				),
			).toBe(true);
		});

		it('should initialize tools when receiving first parent message', () => {
			mockParentConversation.addMessage(
				ConversationParticipant.PARENT,
				'Start task',
			);

			taskAgent.step();

			expect((taskAgent as any).tools).toBeDefined();
			expect((taskAgent as any).iterationCount).toBe(0);
		});

		it('should handle child completion messages', () => {
			const childAgent = new TaskAgent(
				mockWriteEvent,
				'child-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			const childConversation = new Conversation();
			childConversation.pendingToolCallId = 'tool-123';

			taskAgent.addChild(childAgent, childConversation);
			taskAgent.status = AgentStatus.WAITING;

			// Add pending tool block first
			const toolCall = createMockToolCall('tool-123', 'delegate_work');
			taskAgent.agentContext.addPendingToolBlock(toolCall);

			// Simulate child response
			childConversation.addMessage(
				ConversationParticipant.CHILD,
				'Task completed successfully',
			);

			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.THINKING);
			expect(childConversation.pendingToolCallId).toBeUndefined();
		});
	});

	describe('LLM integration and tool execution', () => {
		beforeEach(() => {
			// Setup agent with tools
			(taskAgent as any).tools = [mockTool, mockAttemptCompletionTool];
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 1;
		});

		it('should make LLM call when stepping in THINKING state', () => {
			const toolCall = createMockToolCall('tool-1', 'mock_tool');
			const mockResponse = createMockLLMResponse([toolCall]);
			mockLLMProvider.chatCompletion.mockResolvedValue(mockResponse);

			taskAgent.step();

			expect(mockLLMProvider.chatCompletion).toHaveBeenCalledWith(
				expect.objectContaining({
					model: 'test-model',
					messages: expect.any(Array),
					tool_choice: 'required',
					temperature: 0.7,
					stream: false,
				}),
				expect.arrayContaining([mockTool, mockAttemptCompletionTool]),
			);
		});

		it('should transition to ACTING when LLM returns tool calls', async () => {
			const toolCall = createMockToolCall('tool-1', 'mock_tool');
			const mockResponse = createMockLLMResponse([toolCall]);
			mockLLMProvider.chatCompletion.mockResolvedValue(mockResponse);

			taskAgent.step();

			// Wait for async LLM call to complete
			await vi.waitFor(() => {
				expect(taskAgent.status).toBe(AgentStatus.ACTING);
			});

			expect((taskAgent as any).currentToolCalls).toEqual([toolCall]);
			expect((taskAgent as any).currentToolIndex).toBe(0);
		});

		it('should execute tools when stepping in ACTING state', async () => {
			// Setup tool execution scenario
			const toolCall = createMockToolCall('tool-1', 'mock_tool', {
				input: 'test',
			});
			(taskAgent as any).currentToolCalls = [toolCall];
			(taskAgent as any).currentToolIndex = 0;
			taskAgent.status = AgentStatus.ACTING;

			mockTool.enact.mockResolvedValue('Tool executed successfully');

			taskAgent.step();

			await vi.waitFor(() => {
				expect(mockTool.enact).toHaveBeenCalledWith(
					{input: 'test'},
					taskAgent,
					mockWriteEvent,
					'tool-1',
				);
			});
		});

		it('should complete task when attempt_completion tool is used', async () => {
			const toolCall = createMockToolCall('tool-1', attemptCompletionToolName);
			(taskAgent as any).currentToolCalls = [toolCall];
			(taskAgent as any).currentToolIndex = 0;
			taskAgent.status = AgentStatus.ACTING;

			mockAttemptCompletionTool.enact.mockResolvedValue('Task completed');

			taskAgent.step();

			await vi.waitFor(() => {
				expect(taskAgent.status).toBe(AgentStatus.IDLE);
			});
		});

		it('should handle multiple tool calls sequentially', async () => {
			const toolCall1 = createMockToolCall('tool-1', 'mock_tool');
			const toolCall2 = createMockToolCall('tool-2', 'mock_tool');

			(taskAgent as any).currentToolCalls = [toolCall1, toolCall2];
			(taskAgent as any).currentToolIndex = 0;
			taskAgent.status = AgentStatus.ACTING;

			mockTool.enact.mockResolvedValue('Tool result');

			// Execute first tool
			taskAgent.step();

			await vi.waitFor(() => {
				expect((taskAgent as any).currentToolIndex).toBe(1);
			});

			// Execute second tool
			taskAgent.step();

			await vi.waitFor(() => {
				expect((taskAgent as any).currentToolIndex).toBe(2);
			});

			// Should transition back to THINKING after all tools
			taskAgent.step();
			expect(taskAgent.status).toBe(AgentStatus.THINKING);
		});
	});

	describe('iteration limits and forced completion', () => {
		beforeEach(() => {
			(taskAgent as any).tools = [mockAttemptCompletionTool];
		});

		it('should enforce maximum iteration limit', () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 10; // At max limit

			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.IDLE);
			expect(mockWriteEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Agent Max Cycles Exceeded (10)',
				}),
			);
		});

		it('should add final iteration warning', () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 8; // One before max

			const mockResponse = createMockLLMResponse([]);
			mockLLMProvider.chatCompletion.mockResolvedValue(mockResponse);

			taskAgent.step();

			// Should have added warning message
			const contextBlocks = taskAgent.agentContext.getBlocks();
			const userBlocks = contextBlocks.filter(b => b.type === 'USER');
			expect(
				userBlocks.some(
					b =>
						b.label === 'Final Iteration Warning' &&
						(b.messages[0]?.content as string).includes('run out of time'),
				),
			).toBe(true);
		});

		it('should only allow attempt_completion tool on final iteration', () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 8; // One before max
			(taskAgent as any).tools = [mockTool, mockAttemptCompletionTool];

			const mockResponse = createMockLLMResponse([]);
			mockLLMProvider.chatCompletion.mockResolvedValue(mockResponse);

			taskAgent.step();

			expect(mockLLMProvider.chatCompletion).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({name: attemptCompletionToolName}),
				]),
			);
		});
	});

	describe('error handling', () => {
		it('should handle tool execution errors in executeToolCall method', async () => {
			const toolCall = createMockToolCall('tool-1', 'mock_tool');

			// Setup tools array
			(taskAgent as any).tools = [mockTool];

			const testError = new Error('Tool execution failed');
			mockTool.enact.mockRejectedValue(testError);

			const result = await (taskAgent as any).executeToolCall(toolCall);

			expect(result).toBe(
				'Failed to enact tool mock_tool, received error: Tool execution failed',
			);
			expect(mockWriteEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Failure(mock_tool)',
					content: expect.arrayContaining([
						expect.objectContaining({
							content: 'Error: Tool execution failed',
						}),
					]),
				}),
			);
		});

		it('should handle LLM API errors', async () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 1;

			const apiError = new Error('API rate limit exceeded');
			mockLLMProvider.chatCompletion.mockRejectedValue(apiError);

			taskAgent.step();

			await vi.waitFor(() => {
				expect(taskAgent.status).toBe(AgentStatus.PAUSED);
			});
		});

		it('should handle invalid tool arguments', async () => {
			const toolCall = createMockToolCall('tool-1', 'mock_tool');
			toolCall.function.arguments = 'invalid json {';

			(taskAgent as any).currentToolCalls = [toolCall];
			(taskAgent as any).currentToolIndex = 0;
			taskAgent.status = AgentStatus.ACTING;

			taskAgent.step();

			await vi.waitFor(() => {
				expect(ServerLogger.error).toHaveBeenCalledWith(
					expect.any(Error),
					'Error parsing tool arguments for mock_tool',
				);
			});
		});

		it('should handle unknown tools', async () => {
			const toolCall = createMockToolCall('tool-1', 'unknown_tool');
			(taskAgent as any).currentToolCalls = [toolCall];
			(taskAgent as any).currentToolIndex = 0;
			taskAgent.status = AgentStatus.ACTING;

			taskAgent.step();

			await vi.waitFor(() => {
				expect((taskAgent as any).currentToolIndex).toBe(1);
			});
		});

		it('should handle empty LLM responses', async () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 1;

			const emptyResponse = {choices: []};
			mockLLMProvider.chatCompletion.mockResolvedValue(emptyResponse);

			taskAgent.step();

			await vi.waitFor(() => {
				expect(mockWriteEvent).toHaveBeenCalledWith(
					expect.objectContaining({
						title: 'LLM API Error',
					}),
				);
			});
		});

		it('should not handle errors when paused', async () => {
			taskAgent.status = AgentStatus.ACTING;
			(taskAgent as any).currentToolCalls = [
				createMockToolCall('tool-1', 'mock_tool'),
			];
			(taskAgent as any).currentToolIndex = 0;

			mockTool.enact.mockRejectedValue(new Error('Tool failed'));

			taskAgent.step();
			taskAgent.pause();

			// Wait for async operations
			await new Promise(resolve => setTimeout(resolve, 10));

			// Should not process error when paused
			expect(taskAgent.status).toBe(AgentStatus.PAUSED);
		});
	});

	describe('state machine transitions', () => {
		it('should transition IDLE -> THINKING on parent message', () => {
			expect(taskAgent.status).toBe(AgentStatus.IDLE);

			mockParentConversation.addMessage(
				ConversationParticipant.PARENT,
				'Start task',
			);
			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.THINKING);
		});

		it('should stay in THINKING when LLM call is in progress', () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).isLLMCallInProgress = true;

			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.THINKING);
		});

		it('should transition THINKING -> ACTING on tool calls', async () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 1;
			(taskAgent as any).tools = [mockTool];

			const toolCall = createMockToolCall('tool-1', 'mock_tool');
			const mockResponse = createMockLLMResponse([toolCall]);
			mockLLMProvider.chatCompletion.mockResolvedValue(mockResponse);

			taskAgent.step();

			await vi.waitFor(() => {
				expect(taskAgent.status).toBe(AgentStatus.ACTING);
			});
		});

		it('should stay in ACTING when tool call is in progress', () => {
			taskAgent.status = AgentStatus.ACTING;
			(taskAgent as any).isToolCallInProgress = true;

			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.ACTING);
		});

		it('should transition ACTING -> THINKING after all tools complete', () => {
			taskAgent.status = AgentStatus.ACTING;
			(taskAgent as any).currentToolCalls = [
				createMockToolCall('tool-1', 'mock_tool'),
			];
			(taskAgent as any).currentToolIndex = 1; // Beyond array length

			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.THINKING);
		});

		it('should transition WAITING -> THINKING when all children complete', () => {
			const childAgent = new TaskAgent(
				mockWriteEvent,
				'child-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			childAgent.status = AgentStatus.IDLE; // Child is done

			taskAgent.addChild(childAgent, new Conversation());
			taskAgent.status = AgentStatus.WAITING;

			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.THINKING);
		});

		it('should stay in WAITING while children are active', () => {
			const childAgent = new TaskAgent(
				mockWriteEvent,
				'child-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			childAgent.status = AgentStatus.THINKING; // Child is still working

			// Prevent child from making LLM calls during test
			const childSpy = vi
				.spyOn(childAgent, 'step')
				.mockImplementation(() => {});

			taskAgent.addChild(childAgent, new Conversation());
			taskAgent.status = AgentStatus.WAITING;

			taskAgent.step();

			expect(taskAgent.status).toBe(AgentStatus.WAITING);
			expect(childSpy).toHaveBeenCalled();
		});

		it('should return early when PAUSED', () => {
			taskAgent.status = AgentStatus.PAUSED;

			const stepResult = taskAgent.step();

			expect(stepResult).toBeUndefined();
		});
	});

	describe('usage tracking and context management', () => {
		it('should update cost and context usage from LLM response', async () => {
			taskAgent.status = AgentStatus.THINKING;
			(taskAgent as any).iterationCount = 1;

			const usage: CompletionUsageStats = {
				completion_tokens: 100,
				completion_tokens_details: {},
				cost: 0.015,
				cost_details: {
					upstream_inference_cost: 0.1,
				},
				prompt_tokens: 200,
				total_tokens: 300,
				prompt_tokens_details: {reasoning_tokens: 50},
			};

			const mockResponse = createMockLLMResponse([], usage);
			mockLLMProvider.chatCompletion.mockResolvedValue(mockResponse);

			taskAgent.step();

			await vi.waitFor(() => {
				expect(taskAgent.cost).toBe(0.015);
				expect(taskAgent.contextUsed).toBe(200);
			});
		});

		it('should provide context through getContext method', () => {
			const context = taskAgent.getContext();

			expect(Array.isArray(context)).toBe(true);
			expect(context[0]).toEqual({
				role: 'system',
				content: 'You are a test agent.',
			});
		});
	});

	describe('child stepping', () => {
		it('should step all children during step execution', () => {
			const childAgent1 = new TaskAgent(
				mockWriteEvent,
				'child-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			const childAgent2 = new TaskAgent(
				mockWriteEvent,
				'child-agent',
				new Conversation(),
				mockContinuousContextManager,
			);

			const stepSpy1 = vi.spyOn(childAgent1, 'step');
			const stepSpy2 = vi.spyOn(childAgent2, 'step');

			taskAgent.addChild(childAgent1, new Conversation());
			taskAgent.addChild(childAgent2, new Conversation());

			taskAgent.step();

			expect(stepSpy1).toHaveBeenCalled();
			expect(stepSpy2).toHaveBeenCalled();
		});
	});

	describe('ContinuousContext integration', () => {
		let mockContinuousContextManager: ContinuousContextManager;

		beforeEach(() => {
			// Create a fresh mock for these tests
			mockContinuousContextManager = new ContinuousContextManager();
			vi.mocked(
				mockContinuousContextManager.getCurrentContextContent,
			).mockReturnValue('Test context content');
			vi.mocked(mockContinuousContextManager.updateContext).mockResolvedValue(
				undefined,
			);
		});

		it('should initialize with project context when ContinuousContextManager is provided', () => {
			const agent = new TaskAgent(
				mockWriteEvent,
				'test-agent',
				new Conversation(),
				mockContinuousContextManager,
			);

			const context = agent.getContext();
			expect(context).toHaveLength(2); // System + Context user
			expect(context[1]).toEqual({
				role: 'user',
				content: 'Test context content',
			});
			expect(context[2]).toEqual({
				role: 'assistant',
				content:
					'I understand the current project context and will use this information to assist effectively.',
			});
		});

		it('should initialize without context block when ContinuousContextManager has no content', () => {
			vi.mocked(
				mockContinuousContextManager.getCurrentContextContent,
			).mockReturnValue('');

			const agent = new TaskAgent(
				mockWriteEvent,
				'test-agent',
				new Conversation(),
				mockContinuousContextManager,
			);

			const context = agent.getContext();
			expect(context).toHaveLength(1); // Only system message
			expect(context[0]).toEqual({
				role: 'system',
				content: 'You are a test agent.',
			});
		});

		it('should trigger context update on AttemptCompletion tool execution', async () => {
			const agent = new TaskAgent(
				mockWriteEvent,
				'test-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			(agent as any).tools = [mockAttemptCompletionTool];

			const toolCall = createMockToolCall('tool-1', attemptCompletionToolName);
			(agent as any).currentToolCalls = [toolCall];
			(agent as any).currentToolIndex = 0;
			agent.status = AgentStatus.ACTING;

			mockAttemptCompletionTool.enact.mockResolvedValue(
				'Task completed successfully',
			);

			agent.step();

			await vi.waitFor(() => {
				expect(mockContinuousContextManager.updateContext).toHaveBeenCalled();
			});
		});

		it('should trigger context update on DelegateWork tool execution', async () => {
			const agent = new TaskAgent(
				mockWriteEvent,
				'test-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			const mockDelegateWorkTool = {
				name: 'delegate_work',
				enact: vi.fn().mockResolvedValue('Task delegated successfully'),
			};
			(agent as any).tools = [mockDelegateWorkTool];

			const toolCall = createMockToolCall('tool-1', 'delegate_work');
			(agent as any).currentToolCalls = [toolCall];
			(agent as any).currentToolIndex = 0;
			agent.status = AgentStatus.ACTING;

			agent.step();

			await vi.waitFor(() => {
				expect(mockContinuousContextManager.updateContext).toHaveBeenCalled();
			});
		});

		it('should not trigger context update on other tool executions', async () => {
			const agent = new TaskAgent(
				mockWriteEvent,
				'test-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			(agent as any).tools = [mockTool];

			const toolCall = createMockToolCall('tool-1', 'mock_tool');
			(agent as any).currentToolCalls = [toolCall];
			(agent as any).currentToolIndex = 0;
			agent.status = AgentStatus.ACTING;

			mockTool.enact.mockResolvedValue('Tool executed successfully');

			agent.step();

			await vi.waitFor(() => {
				expect(mockTool.enact).toHaveBeenCalled();
			});

			// Should not have triggered context update
			expect(mockContinuousContextManager.updateContext).not.toHaveBeenCalled();
		});

		it('should refresh context when transitioning from WAITING to THINKING', () => {
			const agent = new TaskAgent(
				mockWriteEvent,
				'test-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			const refreshContextBlockSpy = vi.spyOn(
				agent.agentContext,
				'refreshContextBlock',
			);

			// Set up scenario where agent is waiting with no active children
			agent.status = AgentStatus.WAITING;

			agent.step();

			expect(agent.status).toBe(AgentStatus.THINKING);
			expect(refreshContextBlockSpy).toHaveBeenCalled();
		});

		it('should handle context update errors gracefully', async () => {
			const agent = new TaskAgent(
				mockWriteEvent,
				'test-agent',
				new Conversation(),
				mockContinuousContextManager,
			);
			(agent as any).tools = [mockAttemptCompletionTool];

			// Make updateContext throw an error
			vi.mocked(mockContinuousContextManager.updateContext).mockRejectedValue(
				new Error('Context update failed'),
			);

			const toolCall = createMockToolCall('tool-1', attemptCompletionToolName);
			(agent as any).currentToolCalls = [toolCall];
			(agent as any).currentToolIndex = 0;
			agent.status = AgentStatus.ACTING;

			mockAttemptCompletionTool.enact.mockResolvedValue(
				'Task completed successfully',
			);

			agent.step();

			await vi.waitFor(() => {
				expect(mockContinuousContextManager.updateContext).toHaveBeenCalled();
			});

			// Agent should continue working normally despite context update error
			expect(agent.status).toBe(AgentStatus.IDLE);
			expect(ServerLogger.error).toHaveBeenCalledWith(
				'Failed to update continuous context:',
				expect.any(Error),
			);
		});

		it('should create child agents with same ContinuousContextManager', () => {
			const parentAgent = new TaskAgent(
				mockWriteEvent,
				'test-agent',
				new Conversation(),
				mockContinuousContextManager,
			);

			const childAgent = parentAgent.createChildAgent(
				'child-agent',
				new Conversation(),
			);

			// Verify child has the same context manager by checking if it initializes with context
			const childContext = childAgent.getContext();
			expect(childContext).toHaveLength(3); // Should have context blocks like parent
			expect(childContext[1]).toEqual({
				role: 'user',
				content: 'Test context content',
			});
		});
	});
});
