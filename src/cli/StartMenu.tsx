import React, {Dispatch, SetStateAction, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {colors, useStdOutDim} from '@cli/Util.js';
import TextInput from 'ink-text-input';
import BigText from 'ink-big-text';
import {getAgentTypes} from '@server/PromiseServer.js';

export interface StartMenuProps {
	setTask: Dispatch<SetStateAction<string | null>>;
	setAgent: Dispatch<SetStateAction<string | null>>;
}

export const StartMenu: React.FC<StartMenuProps> = ({setTask, setAgent}) => {
	const agentList = getAgentTypes();
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
	const [tempTask, setTempTask] = useState<string>('');
	const screenDimensions = useStdOutDim();

	useInput((input, key) => {
		if (selectedAgent) {
			// Handle escape to go back to agent selection
			if (key.escape) {
				setSelectedAgent(null);
				return;
			}
		} else {
			// Agent selection navigation
			if (key.upArrow) {
				setSelectedIndex(prev => (prev > 0 ? prev - 1 : agentList.length - 1));
			}

			if (key.downArrow) {
				setSelectedIndex(prev => (prev < agentList.length - 1 ? prev + 1 : 0));
			}

			if (key.return) {
				setSelectedAgent(agentList[selectedIndex]!.id || null);
				setAgent(agentList[selectedIndex]!.id || null);
			}
		}
	});

	const handleSubmit = () => {
		setTask(tempTask.trim());
	};

	let maxAgentNameLength = Math.max(...agentList.map(i => i.name.length));

	// If agent is selected but task not confirmed, show task input
	return (
		<Box
			flexDirection="column"
			width={screenDimensions[0]}
			height={screenDimensions[1]}
			alignItems="center"
			justifyContent="center"
		>
			<BigText
				colors={[colors.accentColor, colors.highlightColor]}
				text="OrgChart"
			/>
			{selectedAgent ? (
				<>
					<Text color={colors.textColor}>
						Selected: {agentList[selectedIndex]!.name}
					</Text>
					<Text>{agentList[selectedIndex]!.description}</Text>
					<Text></Text>
					<Box
						borderStyle="round"
						borderDimColor
						width={Math.min(
							screenDimensions[0],
							Math.max(15, Math.floor(screenDimensions[0] / 2)),
						)}
					>
						<Text color={colors.accentColor}>&gt; </Text>
						<TextInput
							value={tempTask}
							onChange={setTempTask}
							onSubmit={handleSubmit}
							placeholder={`Describe your request for the ${
								agentList[selectedIndex]!.name
							}...`}
						/>
					</Box>
					<Box>
						<Text dimColor>Press Enter to continue, Esc to go back</Text>
					</Box>
				</>
			) : (
				<>
					<Box flexDirection="column" width={screenDimensions[0]}>
						{agentList.map((agent, index) => (
							<Box key={agent.id} flexDirection="row">
								<Box
									width={3 + maxAgentNameLength}
									marginRight={2}
									flexShrink={0}
								>
									<Text
										color={
											index === selectedIndex
												? colors.highlightColor
												: colors.textColor
										}
										bold={index === selectedIndex}
									>
										{index === selectedIndex
											? `> ${agent.name}`
											: `  ${agent.name}`}
									</Text>
								</Box>
								<Box flexShrink={1}>
									<Text
										color={
											index === selectedIndex
												? colors.textColor
												: colors.subtextColor
										}
									>
										{agent.description}
									</Text>
								</Box>
							</Box>
						))}
						<Text></Text>
					</Box>
					<Box>
						<Text dimColor>↑↓ Navigate, Enter to select</Text>
					</Box>
				</>
			)}
		</Box>
	);
};
