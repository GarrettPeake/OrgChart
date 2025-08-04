import fs from 'fs';
import path from 'path';
import {LLMProvider} from '../LLMProvider.js';

export type OrgChartConfig = {
	rootDir: string;
	orgChartDir: string;
	ignorePatterns: string[];
	maxAgentIterations: number;
	llmProvider: LLMProvider;
};

let config: OrgChartConfig = (() => {
	const rootDir = process.cwd();
	const orgChartDir = path.join(rootDir, '.orgchart');
	fs.mkdirSync(orgChartDir, {recursive: true});
	return {
		rootDir,
		orgChartDir,
		ignorePatterns: ['node_modules'],
		maxAgentIterations: 30,
		llmProvider: new LLMProvider(),
	};
})();

export const getConfig = (): OrgChartConfig => config;

export const updateConfig = (
	key: keyof OrgChartConfig,
	value: any,
): OrgChartConfig => {
	config![key] = value;
	return config;
};
