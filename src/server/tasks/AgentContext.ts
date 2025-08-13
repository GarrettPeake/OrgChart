import {
	CompletionInputMessage,
	ToolCall,
} from '../utils/provider/OpenRouter.js';
import {ContinuousContextManager} from '../workflows/ContinuousContext.js';
import Logger, {ContextLogger} from '@/Logger.js';

export type BlockType =
	| 'TOOL'
	| 'PARENT'
	| 'CONTEXT'
	| 'SYSTEM'
	| 'USER'
	| 'ASSISTANT';

export interface ContextBlock {
	type: BlockType;
	label?: string; // Tool name for TOOL blocks, or descriptive label for others
	messages: CompletionInputMessage[];
	metadata?: {
		toolCallId?: string;
		parentConversationId?: string;
		contextVersion?: number;
		timestamp?: number;
	};
}

/**
 * AgentContext manages the conversational context for an agent using smart blocks.
 * Each block groups related messages together logically, enabling better context management
 * and future operations without overloading the TaskAgent class.
 */
export class AgentContext {
	private blocks: ContextBlock[] = [];
	private continuousContextManager: ContinuousContextManager;
	private agentInstanceId?: string;

	constructor(
		systemPrompt: string,
		continuousContextManager: ContinuousContextManager,
		agentInstanceId?: string,
	) {
		// Initialize with system block
		this.addSystemBlock(systemPrompt);
		this.continuousContextManager = continuousContextManager;
		this.agentInstanceId = agentInstanceId;
	}

	/**
	 * Set the agent instance ID for logging purposes
	 */
	setAgentInstanceId(agentInstanceId: string): void {
		this.agentInstanceId = agentInstanceId;
	}

	/**
	 * Call the ContextLogger if available and agent instance ID is set
	 */
	private logContext(): void {
		if (this.agentInstanceId && ContextLogger) {
			ContextLogger.getAgentLogger(this.agentInstanceId)().catch(error => {
				Logger.warn(
					`Failed to log context for ${this.agentInstanceId}:`,
					error,
				);
			});
		}
	}

	/**
	 * Add a system message block
	 */
	addSystemBlock(content: string): void {
		this.blocks.push({
			type: 'SYSTEM',
			label: 'System Prompt',
			messages: [
				{
					role: 'system',
					content: content,
				},
			],
			metadata: {
				timestamp: Date.now(),
			},
		});
		this.logContext();
	}

	/**
	 * Add a user message block
	 */
	addUserBlock(content: string, label?: string): void {
		this.blocks.push({
			type: 'USER',
			label: label || 'User Input',
			messages: [
				{
					role: 'user',
					content: content,
				},
			],
			metadata: {
				timestamp: Date.now(),
			},
		});
		this.logContext();
	}

	/**
	 * Add an assistant message block (for simple responses without tools)
	 */
	addAssistantBlock(content: string, label?: string): void {
		this.blocks.push({
			type: 'ASSISTANT',
			label: label || 'Assistant Response',
			messages: [
				{
					role: 'assistant',
					content: content,
				},
			],
			metadata: {
				timestamp: Date.now(),
			},
		});
		this.logContext();
	}

	/**
	 * Add a parent message block - messages sent by the parent agent
	 */
	addParentBlock(content: string, parentConversationId?: string): void {
		this.blocks.push({
			type: 'PARENT',
			label: 'Parent Message',
			messages: [
				{
					role: 'user',
					content: content,
				},
			],
			metadata: {
				parentConversationId,
				timestamp: Date.now(),
			},
		});
		this.logContext();
	}

	/**
	 * Add a context block from ContinuousContext with optional simulated model response
	 */
	addContextBlock(contextContent: string, simulatedResponse?: string): void {
		const messages: CompletionInputMessage[] = [
			{
				role: 'user',
				content: contextContent,
			},
		];

		if (simulatedResponse) {
			messages.push({
				role: 'assistant',
				content: simulatedResponse,
			});
		}

		this.blocks.push({
			type: 'CONTEXT',
			label: 'Project Context',
			messages,
			metadata: {
				contextVersion: Date.now(),
				timestamp: Date.now(),
			},
		});
		this.logContext();
	}

	/**
	 * Add tool blocks from an assistant response with multiple tool calls.
	 * This splits multiple tool calls into separate conversational turns as requested.
	 */
	addToolBlocks(toolCalls: ToolCall[], toolResults: Map<string, string>): void {
		for (const toolCall of toolCalls) {
			const toolResult = toolResults.get(toolCall.id);
			if (toolResult !== undefined) {
				this.addSingleToolBlock(toolCall, toolResult);
			} else {
				Logger.warn(`Missing tool result for tool call ${toolCall.id}`);
			}
		}
	}

	/**
	 * Add a single tool block containing one tool call and its result
	 */
	addSingleToolBlock(toolCall: ToolCall, toolResult: string): void {
		const toolName = toolCall.function.name;

		this.blocks.push({
			type: 'TOOL',
			label: toolName,
			messages: [
				{
					role: 'assistant',
					content: '',
					tool_calls: [toolCall],
				},
				{
					role: 'tool',
					content: toolResult,
					tool_call_id: toolCall.id,
				},
			],
			metadata: {
				toolCallId: toolCall.id,
				timestamp: Date.now(),
			},
		});
		this.logContext();
	}

	/**
	 * Add a pending tool block with just the tool call (result will be added later)
	 */
	addPendingToolBlock(toolCall: ToolCall): void {
		const toolName = toolCall.function.name;

		this.blocks.push({
			type: 'TOOL',
			label: `${toolName} (pending)`,
			messages: [
				{
					role: 'assistant',
					content: '',
					tool_calls: [toolCall],
				},
				{
					role: 'tool',
					content: 'Tool execution in progress...',
					tool_call_id: toolCall.id,
				},
			],
			metadata: {
				toolCallId: toolCall.id,
				timestamp: Date.now(),
			},
		});
		this.logContext();
	}

	/**
	 * Update a pending tool block with the actual result
	 */
	updateToolBlockResult(toolCallId: string, toolResult: string): boolean {
		const blockIndex = this.blocks.findIndex(
			block =>
				block.type === 'TOOL' && block.metadata?.toolCallId === toolCallId,
		);

		if (blockIndex === -1) {
			return false;
		}

		const block = this.blocks[blockIndex]!;
		const toolMessage = block.messages.find(
			msg => msg.role === 'tool' && msg.tool_call_id === toolCallId,
		);

		if (toolMessage) {
			toolMessage.content = toolResult;
			// Update label to remove "(pending)"
			block.label = block.label?.replace(' (pending)', '') || 'Tool';
			this.logContext();
			return true;
		}

		return false;
	}

	/**
	 * Convert all blocks to a flat array of CompletionInputMessage for OpenAI API
	 */
	toCompletionMessages(): CompletionInputMessage[] {
		const messages: CompletionInputMessage[] = [];

		for (const block of this.blocks) {
			messages.push(...block.messages);
		}

		return messages;
	}

	/**
	 * Get all blocks for inspection/debugging
	 */
	getBlocks(): ContextBlock[] {
		return [...this.blocks];
	}

	/**
	 * Get blocks of a specific type
	 */
	getBlocksByType(type: BlockType): ContextBlock[] {
		return this.blocks.filter(block => block.type === type);
	}

	/**
	 * Get the latest block of a specific type
	 */
	getLatestBlockByType(type: BlockType): ContextBlock | undefined {
		const blocks = this.getBlocksByType(type);
		return blocks[blocks.length - 1];
	}

	/**
	 * Remove blocks by type (useful for cleanup)
	 */
	removeBlocksByType(type: BlockType): void {
		this.blocks = this.blocks.filter(block => block.type !== type);
		this.logContext();
	}

	/**
	 * Add context from the continuous context manager if available
	 */
	refreshContextBlock(): void {
		if (this.continuousContextManager) {
			const contextContent =
				this.continuousContextManager.getCurrentContextContent();
			if (contextContent) {
				// Remove existing context blocks and add fresh one
				this.removeBlocksByType('CONTEXT');
				this.addContextBlock(
					contextContent,
					'I understand the current project context and will use this information to assist effectively.',
				);
				// Note: logging happens in addContextBlock, no need to log here
			}
		}
	}

	/**
	 * Get statistics about the context
	 */
	getStats(): {
		totalBlocks: number;
		totalMessages: number;
		blocksByType: Record<BlockType, number>;
		estimatedTokens: number;
	} {
		const blocksByType: Record<BlockType, number> = {
			TOOL: 0,
			PARENT: 0,
			CONTEXT: 0,
			SYSTEM: 0,
			USER: 0,
			ASSISTANT: 0,
		};

		let totalMessages = 0;
		let estimatedTokens = 0;

		for (const block of this.blocks) {
			blocksByType[block.type]++;
			totalMessages += block.messages.length;

			// Rough token estimation (4 characters = 1 token)
			for (const message of block.messages) {
				estimatedTokens += Math.ceil((message.content?.length || 0) / 4);
			}
		}

		return {
			totalBlocks: this.blocks.length,
			totalMessages,
			blocksByType,
			estimatedTokens,
		};
	}

	/**
	 * Generate a debug summary of the context structure
	 */
	generateDebugSummary(): string {
		const stats = this.getStats();
		let summary = `Agent Context Summary:\n`;
		summary += `- Total Blocks: ${stats.totalBlocks}\n`;
		summary += `- Total Messages: ${stats.totalMessages}\n`;
		summary += `- Estimated Tokens: ${stats.estimatedTokens}\n\n`;

		summary += `Blocks by Type:\n`;
		for (const [type, count] of Object.entries(stats.blocksByType)) {
			if (count > 0) {
				summary += `- ${type}: ${count}\n`;
			}
		}

		summary += `\nBlock Details:\n`;
		for (let i = 0; i < this.blocks.length; i++) {
			const block = this.blocks[i]!;
			summary += `${i + 1}. [${block.type}] ${block.label || 'Unlabeled'} (${
				block.messages.length
			} messages)\n`;
		}

		return summary;
	}
}
