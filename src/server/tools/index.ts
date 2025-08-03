import {StreamEvent} from '../../cli/EventStream.js';
import {attemptCompletionToolDefinition} from './AttemptCompletionTool.js';
import {readToolDefinition} from './ReadFileTool.js';
import {updateTodoListToolDefinition} from './UpdateTodoListTool.js';
import {writeToolDefinition} from './WriteTool.js';
import {bashToolDefinition} from './BashTool.js';

export interface ToolDefinition {
	name: string;
	descriptionForAgent: string;
	inputSchema: {
		type: string;
		properties: Record<string, any>;
		required?: string[];
		[key: string]: any;
	};
	enact: (args: any) => Promise<string>;
	formatEvent: (args: any) => Promise<StreamEvent>;
}

export const tools = {
	[readToolDefinition.name]: readToolDefinition,
	[attemptCompletionToolDefinition.name]: attemptCompletionToolDefinition,
	[writeToolDefinition.name]: writeToolDefinition,
	[updateTodoListToolDefinition.name]: updateTodoListToolDefinition,
	[bashToolDefinition.name]: bashToolDefinition,
	// TODO: add the rest
};

export const commonTools = [
	attemptCompletionToolDefinition,
	updateTodoListToolDefinition,
];
