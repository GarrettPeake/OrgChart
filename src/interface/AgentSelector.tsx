import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {agents, Agent} from '../agents/Agents.js';
import {Main} from './Main.js';
import { colors, useStdOutDim } from './index.js';
import TextInput from 'ink-text-input';
import BigText from 'ink-big-text';

export const AgentSelector: React.FC = () => {
	const agentList = Object.values(agents);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
	const [task, setTask] = useState<string>('');
	const [taskConfirmed, setTaskConfirmed] = useState<boolean>(false);
	const screenDimensions = useStdOutDim();

	useInput((input, key) => {
		if (selectedAgent) {
			// If task is confirmed, don't allow further modification
			if (!taskConfirmed) {
				// Handle escape to go back to agent selection
				if (key.escape) {
					setSelectedAgent(null);
					setTask('');
					setTaskConfirmed(false);
					return;
				}
			}
		} else {
			// Agent selection navigation
			if (key.upArrow) {
				setSelectedIndex(prev => prev > 0 ? prev - 1 : agentList.length - 1);
			}

			if (key.downArrow) {
				setSelectedIndex(prev => prev < agentList.length - 1 ? prev + 1 : 0);
			}

			if (key.return) {
				setSelectedAgent(agentList[selectedIndex] || null);
			}
		}
	});

	const handleSubmit = () => {
		if (task.trim()) {
			setTaskConfirmed(true)
		}
	};

	// If agent and task are confirmed, show main interface
	if (selectedAgent && taskConfirmed && task.trim()) {
		return <Main agent={selectedAgent} task={task.trim()} />;
	}

	// If agent is selected but task not confirmed, show task input
	return (
		<Box flexDirection="column" width={screenDimensions[0]} height={screenDimensions[1]} alignItems='center' justifyContent='center'>
			<BigText colors={[colors.accentColor, colors.highlightColor]} text="OrgChart"/>
			{
				selectedAgent ?
					<>
						<Text color={colors.textColor}>Selected: {selectedAgent.name}</Text>
						<Text>{selectedAgent.description}</Text>
						<Text></Text>
						<Box borderStyle="round" borderDimColor width={Math.min(screenDimensions[0], Math.max(15, Math.floor(screenDimensions[0] / 2)))}>
							<Text color={colors.accentColor}>&gt; </Text>
							<TextInput
								value={task}
								onChange={setTask}
								onSubmit={handleSubmit}
								placeholder={`Describe your request for the ${selectedAgent.name}...`}
							/>
						</Box>
						<Box>
							<Text dimColor>Press Enter to continue, Esc to go back</Text>
						</Box>
					</>
				: <>
					<Box flexDirection='column'>
						{agentList.map((agent, index) => (
							<Box key={agent.id} flexDirection="row">
								<Text
									color={index === selectedIndex ? colors.highlightColor : colors.textColor}
									bold={index === selectedIndex}
									>
									{index === selectedIndex ? `> ${agent.name}` : `  ${agent.name}`}
								</Text>
								<Box marginLeft={2} flexGrow={1}>
									<Text
										color={index === selectedIndex ? colors.textColor : colors.subtextColor}
										>
										{agent.description}
									</Text>
								</Box>
							</Box>
						))}
						<Text></Text>
					</Box>
					<Text dimColor>↑↓ Navigate, Enter to select</Text>
				</>
			}
		</Box>
	);
};