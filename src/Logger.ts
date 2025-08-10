import {pino} from 'pino';
import path from 'path';
import fs from 'fs/promises';
import {TaskAgent} from './server/tasks/TaskAgent.js';
import {getConfig} from './server/utils/Configuration.js';

const fileTransport = pino.transport({
	target: 'pino/file',
	options: {destination: path.join(getConfig().orgChartDir, 'app.log')},
});

const Logger = pino(
	{
		formatters: {
			level: label => {
				return {};
			},
			bindings: bindings => {
				return {};
			},
		},
	},
	fileTransport,
);
export default Logger;

/**
 * Simple logger to enable creating a directory structure of context json files
 */
export let ContextLogger: {
	getAgentLogger: (agentInstanceId: string) => () => Promise<void>;
};
export const initContextLogger = (runId: string, baseAgent: TaskAgent) => {
	const baseDir = path.join(getConfig().orgChartDir, 'ContextLogs', runId);
	ContextLogger = {
		getAgentLogger: (agentInstanceId: string) => async () => {
			try {
				// Find this agent in the agent tree
				const [taskAgent, agentPath] = agentDfs(baseAgent, agentInstanceId) || [
					undefined,
					[],
				];
				if (taskAgent === undefined) {
					Logger.info(`Could not locate ${agentInstanceId} in agent tree`);
					return;
				}
				// Ensure the directory exists
				const file_path = path.join(baseDir, ...agentPath, 'context.json');
				const dir = path.dirname(file_path);
				await fs.mkdir(dir, {recursive: true});
				// Write the content to the file
				await fs.writeFile(
					file_path,
					JSON.stringify(taskAgent.context, null, 4),
					'utf8',
				);
			} catch (error) {
				throw new Error(`Failed to write context for ${agentInstanceId}: ${error}`);
			}
		},
	};
};

function agentDfs(
	agent: TaskAgent,
	targetId: string,
	route: string[] = [],
	childIndex: number = 0,
): [TaskAgent, string[]] | undefined {
	route = [
		...route,
		`${childIndex}-${agent.agent.id}-${agent.agentInstanceId}`,
	];
	if (agent.agentInstanceId === targetId) {
		return [agent, route];
	} else {
		for (const [index, child] of agent.children.entries()) {
			const res = agentDfs(child, targetId, route, index);
			if (res != undefined) {
				return res;
			}
		}
	}
	return undefined;
}
