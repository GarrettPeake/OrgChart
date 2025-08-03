import React from 'react';
import {Box, Text} from 'ink';
import {TaskAgent} from '../server/tasks/TaskAgent.js';
import {colors} from './Util.js';

interface AgentTreeProps {
	rootTaskRunner: TaskAgent | null;
}

export const AgentTree: React.FC<AgentTreeProps> = ({rootTaskRunner}) => {
	return (
		<Box flexDirection="column" padding={1} flexShrink={0}>
			{buildAgentTreeComponents(rootTaskRunner)}
		</Box>
	);
};

export const buildAgentTreeComponents = (
	rootTaskRunner: TaskAgent | null,
): React.ReactNode => {
	if (!rootTaskRunner) {
		return null;
	}

	const buildTreeDfs = (
		runner: TaskAgent,
		prefix: number[] = [], // 0 = no more children, 1 = final child, 2 = more children
	): React.ReactNode => {
		const levelPrefix = prefix
			.map((it, index) =>
				it === 0
					? '  '
					: it === 1
					? '└ '
					: index === prefix.length - 1
					? '├ '
					: '│ ',
			)
			.join('');

		const agentInfo = (
			<Text
				dimColor={runner.status === 'exited'}
				color={
					runner.status === 'executing'
						? colors.highlightColor
						: runner.status === 'waiting'
						? colors.textColor
						: colors.subtextColor
				}
				bold
			>
				{runner.agent?.name || 'initializing'}:{' '}
				{runner.contextPercent.toFixed(1)}% - ${runner.cost.toFixed(2)} (
				{runner.status})
			</Text>
		);

		return (
			<Box flexDirection="column" flexShrink={0}>
				<Box flexDirection="row" flexShrink={0}>
					<Text color={colors.textColor} bold>
						{levelPrefix}
						{agentInfo}
					</Text>
				</Box>
				{runner.children.map((child, index) => {
					const isLastChild = index === runner.children.length - 1;
					return (
						<React.Fragment key={child.agent?.id || index}>
							{buildTreeDfs(child, [...prefix, isLastChild ? 1 : 2])}
						</React.Fragment>
					);
				})}
			</Box>
		);
	};

	return buildTreeDfs(rootTaskRunner);
};
