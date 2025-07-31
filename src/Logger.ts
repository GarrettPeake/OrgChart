import {pino} from 'pino';
import {ChatMessage} from './server/LLMProvider.js';
import path from 'path';
import fs from 'fs/promises';
import {TaskAgent} from './server/tasks/TaskAgent.js';

const __dirname = import.meta.dirname;

const fileTransport = pino.transport({
	target: 'pino/file',
	options: {destination: `${__dirname}/app.log`},
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
	getAgentLogger: (agentId: string) => () => Promise<void>;
};
export const initContextLogger = (runId: string, baseAgent: TaskAgent) => {
	const baseDir = path.join(__dirname, 'ContextLogs', runId);
	ContextLogger = {
		getAgentLogger: (agentId: string) => async () => {
			try {
				// Find this agent in the agent tree
				const [taskAgent, agentPath] = agentDfs(baseAgent, agentId) || [
					undefined,
					[],
				];
				if (taskAgent === undefined) {
					Logger.info(`Could not locate ${agentId} in agent tree`);
					return;
				}
				// Ensure the directory exists
				const file_path = path.join(baseDir, ...agentPath, 'context.json');
				Logger.info(file_path);
				const dir = path.dirname(file_path);
				await fs.mkdir(dir, {recursive: true});
				// Write the content to the file
				await fs.writeFile(
					file_path,
					JSON.stringify(taskAgent.context, null, 4),
					'utf8',
				);
			} catch (error) {
				throw new Error(`Failed to write context for ${agentId}: ${error}`);
			}
		},
	};
};

function agentDfs(
	agent: TaskAgent,
	targetId: string,
	route: string[] = [],
): [TaskAgent, string[]] | undefined {
	route = [...route, agent.agentId];
	if (agent.agentId === targetId) {
		return [agent, route];
	} else {
		for (let x of agent.children) {
			const res = agentDfs(x, targetId, route);
			if (res != undefined) {
				return res;
			}
		}
	}
	return undefined;
}
