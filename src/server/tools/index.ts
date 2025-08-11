import {attemptCompletionToolDefinition} from './AttemptCompletionTool.js';
import {readToolDefinition} from './ReadFileTool.js';
import {updateTodoListToolDefinition} from './UpdateTodoListTool.js';
import {writeToolDefinition} from './WriteTool.js';
import {bashToolDefinition} from './BashTool.js';
import {grepToolDefinition} from './GrepTool.js';
import {fileTreeToolDefinition} from './FileTreeTool.js';
import {OrgchartEvent} from '../IOTypes.js';
import {TaskAgent} from '../tasks/TaskAgent.js';
import {delegateWorkTool} from './DelegateWorkTool.js';

export interface ToolDefinition {
	name: string;
	descriptionForAgent: string;
	inputSchema: {
		type: string;
		properties: Record<string, any>;
		required?: string[];
		[key: string]: any;
	};
	enact: (
		args: any,
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	) => Promise<string>;
}

export const commonTools = [
	attemptCompletionToolDefinition,
	updateTodoListToolDefinition,
];

export const readTools = [
	readToolDefinition,
	grepToolDefinition,
	fileTreeToolDefinition,
];

export const writeTools = [writeToolDefinition];

export const tools: ToolDefinition[] = [
	// Common
	...commonTools,
	// Read
	...readTools,
	// Write
	...writeTools,
	// Special
	bashToolDefinition,
];
