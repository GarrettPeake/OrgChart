import { Agent, agents } from "../agents/Agents.js";
import { LLMProvider, ChatMessage, ToolCall } from "../LLMProvider.js";
import { delegateWorkTool, delegateWorkToolName } from "../tools/DelegateWorkTool.js";
import Logger from "../Logger.js";
import { attemptCompletionToolName } from "../tools/AttemptCompletionTool.js";
import { tools } from "../tools/index.js";
import { getAllFiles } from "./Utils.js";
import { StreamEvent } from "../interface/EventStream.js";

export type AgentStatus = 'executing' | 'waiting' | 'exited'

export class TaskAgent {
    private llmProvider: LLMProvider;
    private writeEvent: (event: StreamEvent) => void;
    public children: TaskAgent[] = []
    public agent: Agent;
    public status: AgentStatus = 'waiting'
    public cost: number = 0.0
    public contextPercent: number = 0.000001
    // Initialize context with system prompt and user input
    private context: ChatMessage[];

    constructor(llmProvider: LLMProvider, writeEvent: (event: StreamEvent) => void, agent: Agent, ) {
        this.llmProvider = llmProvider;
        this.writeEvent = writeEvent
        this.agent = agent
        this.context = [];
    }

    private async executeToolCall(toolCall: ToolCall): Promise<string> {
        const toolName = toolCall.function.name;
        let args: any;
        
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch (e) {
            Logger.error(e, `Error parsing tool arguments for ${toolName}`);
            throw `Error parsing tool arguments: ${e}`;
        }
        
        if (toolName === delegateWorkToolName) {
            return await this.handleDelegateTask(args)
        }

        const tool = tools[toolName]
        if (tool === undefined) {
            return "Failed to invoke tool, no tool of that type exists"
        }
        
        this.writeEvent(await tool.formatEvent(args));

        if (toolName === attemptCompletionToolName) {
            return args.result
        }
        return await tool.enact(args)
    }

    private async handleDelegateTask(args: {agentId: string, task: string}): Promise<string> {
        const targetAgent = agents[args.agentId];
        if (!targetAgent) {
            Logger.error(new Error(`Agent ${args.agentId} not found`), "Delegation failure - agent not found");
            throw "Delegation failure";
        }

        const childTaskRunner = new TaskAgent(this.llmProvider, this.writeEvent, targetAgent);
        this.children.push(childTaskRunner)
        this.status = 'waiting'
        const result = await childTaskRunner.runTask(args.task);
        this.status = 'executing'
        return result
    }

    async runTask(input: string): Promise<string> {
        this.status = 'executing'
        try {
            this.writeEvent({title:`Task Started - ${this.agent.name}`, content: `${input}`});

            // Initialize context with system prompt and user input
            const extraSystemPromptDetails = `
                ===
                All files present in the project: ${getAllFiles()}}
            `
            this.context[0] = {
                    role: 'system',
                    content: this.agent.system_prompt + extraSystemPromptDetails
            },
            this.context.push({
                role: 'user',
                content: input
            })

            let isComplete = false;
            let iterations = 0;
            const maxIterations = 150; // Prevent infinite loops

            while (iterations < maxIterations) {
                iterations++;
                this.cost += 1

                let tools = this.agent.tools
                if (this.agent.level > 0) {
                    tools = tools.concat([delegateWorkTool(this.agent.level)])
                }

                const response = await this.llmProvider.chatCompletion({
                        model: this.agent.model,
                        messages: this.context,
                        tool_choice: 'auto',
                        temperature: this.agent.temperature,
                        max_tokens: 4000,
                        stream: false
                    },
                    tools,
                );

                Logger.info(`Request to ${this.agent.name} used ${response.usage?.prompt_tokens}tok`)

                const message = response.choices[0]?.message;

                if (!message) {
                    Logger.warn("No response received from LLM")
                    throw "No response from LLM"
                }

                // Add assistant message to context
                this.context.push({
                    role: 'assistant',
                    content: message.content,
                    tool_calls: message.tool_calls
                });

                // Handle tool calls
                if (message.tool_calls && message.tool_calls.length > 0) {
                    for (const toolCall of message.tool_calls) {
                        const toolResult = await this.executeToolCall(toolCall);
                        Logger.info(`Agent: ${this.agent.name} used ${toolCall.function.name} and received ${toolResult.slice(0, 50)}`)
                        
                        // Add tool result to context
                        this.context.push({
                            role: 'tool',
                            content: toolResult,
                            tool_call_id: toolCall.id
                        });

                        // Check if task is complete
                        if (toolCall.function.name === attemptCompletionToolName) {
                            this.status = "exited"
                            return toolResult
                        }
                    }
                } else {
                    // No tool calls, task might be complete or need clarification
                    Logger.warn("LLM provided no tool calls")
                    throw 'No Tool Calls'
                }
            }
            throw "Infinite loop detected"
        } catch (error) {
            Logger.error(error, "Task execution failed");
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.writeEvent({title: 'Task Error', content: errorMessage});
            throw error
        } finally {
            this.status = 'waiting'
        }
    }
}