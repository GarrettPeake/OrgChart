import fs from 'fs';
import path from 'path';
import {LLMProvider} from './provider/LLMProvider.js';
import {agents} from '../agents/Agents.js';

export type OrgChartConfig = {
	rootDir: string;
	orgChartDir: string;
	projectContextFile: string;
	defaultAgent: keyof typeof agents;
	aiIgnoreFile: string;
	ignorePatterns: string[];
	maxAgentIterations: number;
	llmProvider: LLMProvider;
};

let config: OrgChartConfig | null = null;
let llmProvider: LLMProvider | null = null;

const initializeConfig = (): OrgChartConfig => {
	if (!config) {
		const rootDir = process.cwd();
		const orgChartDir = path.join(rootDir, '/.orgchart');
		fs.mkdirSync(orgChartDir, {recursive: true});
		config = {
			rootDir,
			orgChartDir,
			projectContextFile: path.join(orgChartDir, 'PROJECT.md'),
			aiIgnoreFile: path.join(orgChartDir, '.aiignore'),
			ignorePatterns: ['node_modules'],
			defaultAgent: 'TechnicalProductManager',
			maxAgentIterations: 30,
			get llmProvider() {
				if (!llmProvider) {
					llmProvider = new LLMProvider();
				}
				return llmProvider;
			},
		};
	}
	return config;
};

export const getConfig = (): OrgChartConfig => initializeConfig();

export const updateConfig = <K extends keyof OrgChartConfig>(
	key: K,
	value: OrgChartConfig[K],
): OrgChartConfig => {
	const currentConfig = initializeConfig();
	currentConfig[key] = value;
	return currentConfig;
};
