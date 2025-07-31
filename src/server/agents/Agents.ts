import {ToolDefinition} from '../tools/index.js';
import {AssociateSoftwareEngineer} from './AssociateSoftwareEngineer.js';
import {CodeReviewer} from './CodeReviewer.js';
import {ProjectResearcher} from './ProjectResearcher.js';
import {SeniorSoftwareEngineer} from './SeniorSoftwareEngineer.js';
import {TechnicalProductManager} from './TechnicalProductManager.js';

export interface Agent {
	model: string; // The model which is used by the agent
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
	[TechnicalProductManager.id]: TechnicalProductManager,
	[ProjectResearcher.id]: ProjectResearcher,
	[AssociateSoftwareEngineer.id]: AssociateSoftwareEngineer,
	[SeniorSoftwareEngineer.id]: SeniorSoftwareEngineer,
	[CodeReviewer.id]: CodeReviewer,
};
