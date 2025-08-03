import fs from 'fs';
import path from 'path';

export type OrgChartConfig = {
	rootDir: string;
	orgChartDir: string;
	ignorePatterns: string[];
	maxAgentIterations: number;
};

let config: OrgChartConfig | undefined = undefined;
export const getConfig = (): OrgChartConfig => {
	if (!config) {
		initConfig();
	}
	return config!;
};

export const updateConfig = (
	key: keyof OrgChartConfig,
	value: any,
): OrgChartConfig => {
	if (!config) {
		initConfig();
	}
	config![key] = value;
	return config!;
};

const initConfig = () => {
	const rootDir = process.cwd();
	const orgChartDir = path.join(rootDir, '.orgchart');
	fs.mkdirSync(orgChartDir, {recursive: true});
	const ignorePatterns = ['node_modules'];
	const maxAgentIterations = 30;
	config = {
		rootDir,
		orgChartDir,
		ignorePatterns,
		maxAgentIterations,
	};
};
