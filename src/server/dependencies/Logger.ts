import {pino} from 'pino';
import path from 'path';
import fs from 'fs/promises';
import {TaskAgent} from '@server/tasks/TaskAgent.js';
import {OrgchartConfig} from '@server/dependencies/Configuration.js';

const fileTransport = pino.transport({
	target: 'pino/file',
	options: {
		destination: path.join(OrgchartConfig.orgchartDir, 'server.log'),
	},
});

const ServerLogger = pino(
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
export default ServerLogger;

/**
 * Simple logger to enable creating a directory structure of context json files
 */
export let ContextLogger: {
	getAgentLogger: (agentInstanceId: string) => () => Promise<void>;
};
export const initContextLogger = (baseAgent: TaskAgent) => {
	const baseDir = path.join(
		OrgchartConfig.orgchartDir,
		'ContextLogs',
		OrgchartConfig.runId,
	);
	ContextLogger = {
		getAgentLogger: (agentInstanceId: string) => async () => {
			try {
				// Find this agent in the agent tree
				const [taskAgent, agentPath] = agentDfs(baseAgent, agentInstanceId) || [
					undefined,
					[],
				];
				if (taskAgent === undefined) {
					ServerLogger.info(
						`Could not locate ${agentInstanceId} in agent tree`,
					);
					return;
				}
				// Ensure the directory exists
				const file_path = path.join(baseDir, ...agentPath, 'context.json');
				const dir = path.dirname(file_path);
				await fs.mkdir(dir, {recursive: true});
				// Write the content to the file - use the new AgentContext structure
				const contextData = {
					blocks: taskAgent.agentContext.getBlocks(),
					completionMessages: taskAgent.agentContext.toCompletionMessages(),
					stats: taskAgent.agentContext.getStats(),
					debugSummary: taskAgent.agentContext.generateDebugSummary(),
				};
				await fs.writeFile(
					file_path,
					JSON.stringify(contextData, null, 4),
					'utf8',
				);
			} catch (error) {
				throw new Error(
					`Failed to write context for ${agentInstanceId}: ${error}`,
				);
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
