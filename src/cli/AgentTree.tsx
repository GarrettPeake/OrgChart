import React from 'react';
import {Box, Text} from 'ink';
import {colors} from '@cli/Util.js';
import {AgentStatus, RunningAgentInfo} from '@server/IOTypes.js';

interface AgentTreeProps {
	rootTaskRunner: RunningAgentInfo | undefined;
}

export const AgentTree: React.FC<AgentTreeProps> = ({rootTaskRunner}) => {
	return (
		<Box flexDirection="column" padding={1} flexShrink={0}>
			{buildAgentTreeComponents(rootTaskRunner)}
		</Box>
	);
};

export const buildAgentTreeComponents = (
	rootTaskRunner: RunningAgentInfo | undefined,
): React.ReactNode => {
	if (!rootTaskRunner) {
		return null;
	}

	const buildTreeDfs = (
		agentInfo: RunningAgentInfo,
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

		// If this was the final child of the direct parent, mark the prefix as having no more children
		if (prefix[prefix.length - 1] === 1) {
			prefix[prefix.length - 1] = 0;
		}

		const agentTextLine = (
			<Text
				dimColor={
					agentInfo.status === AgentStatus.IDLE ||
					agentInfo.status === AgentStatus.CREATED
				}
				color={
					agentInfo.status === AgentStatus.THINKING ||
					agentInfo.status === AgentStatus.ACTING
						? colors.highlightColor
						: agentInfo.status === AgentStatus.WAITING
						? colors.textColor
						: colors.subtextColor
				}
				bold
			>
				{agentInfo.name}:{' '}
				{((agentInfo.contextUsage / agentInfo.maxContext) * 100).toFixed(1)}% - $
				{agentInfo.cost.toFixed(2)} ({agentInfo.status})
			</Text>
		);

		return (
			<Box flexDirection="column" flexShrink={0}>
				<Box flexDirection="row" flexShrink={0}>
					<Text color={colors.textColor} bold>
						{levelPrefix}
						{agentTextLine}
					</Text>
				</Box>
				{agentInfo.children?.map((child, index) => {
					const isLastChild = index === agentInfo.children!.length - 1;
					return (
						<React.Fragment key={child.id || index}>
							{buildTreeDfs(child, [...prefix, isLastChild ? 1 : 2])}
						</React.Fragment>
					);
				})}
			</Box>
		);
	};

	return buildTreeDfs(rootTaskRunner);
};
