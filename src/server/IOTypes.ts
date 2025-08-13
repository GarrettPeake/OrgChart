import {agents} from './agents/Agents.js';

export enum DisplayContentType {
	MARKDOWN,
	DIFF,
	TEXT,
}

export type Approval = {
	approvalId: string;
	type: DisplayContentType;
	content: string;
};

// REQUEST TYPES
export type OrgchartCommand = string;

// RETURN TYPES
export enum AgentStatus {
	IDLE = 'idle',
	THINKING = 'thinking',
	ACTING = 'acting',
	WAITING = 'waiting',
	PAUSED = 'paused',
}

export type StaticAgentInfo = {
	name: string;
	id: keyof typeof agents;
	description: string;
};

export type RunningAgentInfo = StaticAgentInfo & {
	cost: number;
	contextUsage: number;
	maxContext: number;
	status: AgentStatus;
	children?: RunningAgentInfo[];
};

export type StreamChunk = {
	type: DisplayContentType;
	content: string;
};

export type OrgchartEvent = {
	title: string;
	content: StreamChunk[];
	id: string;
};
