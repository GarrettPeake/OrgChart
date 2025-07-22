import { StreamEvent } from "../interface/EventStream.js"
import { attemptCompletionToolDefinition } from "./AttemptCompletionTool.js"
import { readToolDefinition } from "./ReadFileTool.js"

export interface ToolDefinition {
	name: string
	descriptionForAgent: string
	inputSchema: {
		type: string
		properties: Record<string, any>
		required?: string[]
		[key: string]: any
	},
	enact: (args: any) => Promise<string>
	formatEvent: (args: any) => Promise<StreamEvent>
}

export const tools = {
	[readToolDefinition.name]: readToolDefinition,
	[attemptCompletionToolDefinition.name]: attemptCompletionToolDefinition
	// TODO: add the rest
}