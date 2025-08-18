import fs from 'fs';
import path from 'path';
import {agents} from '../agents/Agents.js';

/**
 * Configuration values that can be applied at the user or project level
 * Note: Project level takes precedence
 */
type CommonConfig = {
	defaultAgent: keyof typeof agents;
	maxAgentIterations: number;
};

/**
 * Configuration values that can be applied at the user level
 */
type UserConfig = {
	userConfigDir: string; // Directory containing user-level files
};

/**
 * Configuration values that can be applied at the project level
 */
type ProjectConfig = {
	workingDir: string;
	orgchartDir: string; // Directory containing project-level files
	aiIgnoreFile: string;
	ignorePatterns: string[];
};

/**
 * Configuration values applied at the run level
 */
type RunConfig = {
	runId: string;
};

/**
 * Environment variable names for API keys
 */
enum APIKeyEnvVarNames {
	openrouterApiKey = 'OPENROUTER_API_KEY',
}

type APIKeys = Partial<Record<keyof typeof APIKeyEnvVarNames, string>>;

export type OrgChartConfig = APIKeys &
	CommonConfig &
	ProjectConfig &
	UserConfig &
	RunConfig & {
		maxAgentIterations: number;
	};

const workingDir = process.cwd();
const orgchartDir = path.join(workingDir, '/.orgchart');
const runId = crypto.randomUUID().substring(0, 6);
fs.mkdirSync(orgchartDir, {recursive: true});
export const OrgchartConfig: OrgChartConfig = {
    // Shared config
	maxAgentIterations: 30,
	defaultAgent: 'TechnicalProductManager',
	// User config
	userConfigDir: '',
	// Project Config
	workingDir,
	orgchartDir,
	aiIgnoreFile: path.join(orgchartDir, '.aiignore'),
	ignorePatterns: ['node_modules'], // TODO: Deprecate in favor of .aiignore
	// Run config
	runId,
	// API Keys
	openrouterApiKey: process.env[APIKeyEnvVarNames.openrouterApiKey],
};

export const updateConfig = <K extends keyof OrgChartConfig>(
	key: K,
	value: OrgChartConfig[K],
): OrgChartConfig => {
	OrgchartConfig[key] = value;
	// TODO: Also update the corresponding config file
	return OrgchartConfig;
};
