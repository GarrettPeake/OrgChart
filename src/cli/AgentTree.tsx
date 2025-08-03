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
			{buildRunnerLevel(rootTaskRunner)}
		</Box>
	);
};

// TODO: Just do a DFS and build the string as you descend
const buildRunnerLevel = (runner: TaskAgent | null) => {
	return (
		<Box flexDirection="column" flexShrink={0}>
			<Box flexDirection="row" flexShrink={0}>
				<Text
					dimColor={runner?.status === 'exited'}
					color={
						runner?.status === 'executing'
							? colors.highlightColor
							: runner?.status === 'waiting'
							? colors.textColor
							: colors.subtextColor
					}
					bold
				>
					{runner?.agent?.name || 'initializing'}:{' '}
					{runner?.contextPercent.toFixed(1)}% - ${runner?.cost.toFixed(2)}
				</Text>
			</Box>
			{/* For each child, add an indenting character and  */}
			{runner?.children.map((child, index) => (
				<Box key={index} flexDirection="row" flexShrink={0}>
					<Text color={colors.textColor} bold>
						{index !== runner.children.length - 1 ? '├' : '└'}
					</Text>
					{buildRunnerLevel(child)}
				</Box>
			))}
		</Box>
	);
};
