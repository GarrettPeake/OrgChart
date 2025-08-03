import fs from 'fs';
import path from 'path';

export type OrgChartConfig = {
	rootDir: string;
	orgChartDir: string;
	ignorePatterns: string[];
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
	const tempDir = path.join(rootDir, '.orgchart');
	fs.mkdirSync(tempDir, {recursive: true});
	const ignorePatterns = ['node_modules'];
	config = {
		rootDir,
		orgChartDir: tempDir,
		ignorePatterns,
	};
};
