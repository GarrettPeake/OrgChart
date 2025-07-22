// TODO: Interface spec for an agent

import { ToolDefinition } from "../tools/index.js";
import { AssociateSoftwareEngineer } from "./AssociateSoftwareEngineer.js";
import { ProjectResearcher } from "./ProjectResearcher.js";
import { technicalProductManager } from "./TechnicalProductManager.js";

export interface Agent {
    model: string; // The model which is used by the agent
    system_prompt: string; // The system prompt given to the agent
    id: string; // A short ID for the agent,  i.e. "UXDesignMaster"
    name: string; // A friendly, informative name of the agent, i.e. "UX Master Designer"
    description: string; // Short description of this employee's purpose and toolset, i.e. "A master of user experience design"
    tools: ToolDefinition[]; // An array of tools usable by the agent
    level: number; // The level of this agent, described below
    temperature: number; // Controls the model's level of randomness
    thinkingBudget?: number;
}

export const agents: Record<string, Agent> = {
    [technicalProductManager.id]: technicalProductManager,
    [ProjectResearcher.id]: ProjectResearcher,
    [AssociateSoftwareEngineer.id]: AssociateSoftwareEngineer
}