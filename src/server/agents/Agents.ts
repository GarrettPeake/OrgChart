import {ToolDefinition} from '../tools/index.js';
import {AssociateSoftwareEngineer} from './SWE/AssociateSoftwareEngineer.js';
import {CodeReviewer} from './L0/CodeReviewer.js';
import {ProjectResearcher} from './L0/ProjectResearcher.js';
import {SeniorSoftwareEngineer} from './SWE/SeniorSoftwareEngineer.js';
import {TechnicalProductManager} from './Management/TechnicalProductManager.js';
import {JuniorSoftwareEngineer} from './SWE/JuniorSoftwareEngineer.js';

type ClaudeModel = 'anthropic/claude-opus-4' | 'anthropic/claude-sonnet-4';

type GeminiModel =
	| 'google/gemini-2.5-flash-lite'
	| 'google/gemini-2.5-flash'
	| 'google/gemini-2.5-pro';

type OtherModel = 'moonshotai/kimi-k2' | 'qwen/qwen3-coder';

export type LLMModel = ClaudeModel | GeminiModel | OtherModel;

export interface Agent {
	model: LLMModel; // The model which is used by the agent
	id: string; // A short ID for the agent,  i.e. "UXDesignMaster"
	name: string; // A friendly, informative name of the agent, i.e. "UX Master Designer"
	human_description: string; // Short description of this agent's purpose and toolset, i.e. "A master of user experience design" meant to be read by humans
	llm_description: string; // Short description of this agent's purpose and toolset, i.e. "A master of user experience design" meant to be read by humans
	level: number; // The level of this agent, described below
	temperature: number; // Controls the model's level of randomness
	thinkingBudget?: number;
	system_prompt: () => string; // A function to generate the system prompt given to the agent
	tools: () => ToolDefinition[]; // An array of tools usable by the agent
}

export const agents: Record<string, Agent> = {
	// Management Agents
	[TechnicalProductManager.id]: TechnicalProductManager,
	// SWE Agents
	[JuniorSoftwareEngineer.id]: JuniorSoftwareEngineer,
	[AssociateSoftwareEngineer.id]: AssociateSoftwareEngineer,
	[SeniorSoftwareEngineer.id]: SeniorSoftwareEngineer,
	// L0 Agents
	[CodeReviewer.id]: CodeReviewer,
	[ProjectResearcher.id]: ProjectResearcher,
	// Designer Agents
	// Other Agents
};
