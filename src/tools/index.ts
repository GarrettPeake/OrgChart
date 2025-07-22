import { StreamEvent } from "../interface/EventStream.js"
import { attemptCompletionToolDefinition } from "./AttemptCompletionTool.js"
import { readToolDefinition } from "./ReadFileTool.js"
import { writeToolDefinition } from "./WriteTool.js"

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
	[attemptCompletionToolDefinition.name]: attemptCompletionToolDefinition,
	[writeToolDefinition.name]: writeToolDefinition
	// TODO: add the rest
}