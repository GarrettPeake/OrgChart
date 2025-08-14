import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import {colors} from '@cli/Util.js';
import {PromiseServer} from '@/server/PromiseServer.js';
import Logger from '@/Logger.js';

export type CommandPanelStatus = 'text' | 'options';

interface CommandPanelProps {
	onCommandSubmit: (command: string) => void;
	server?: PromiseServer;
}

export const CommandPanel: React.FC<CommandPanelProps> = ({
	onCommandSubmit,
	server,
}) => {
	const [command, setCommand] = useState('');
	const [recommendations, setRecommendations] = useState<
		{name: string; description: string}[]
	>([]);
	const [selectedRecommendation, setSelectedRecommendation] = useState(-1);

	const handleSubmit = () => {
		if (selectedRecommendation !== -1) {
			setCommand(prev => {
				// Compute the overlap between the selection and the input and append the rest to the input
				const selection = recommendations[selectedRecommendation]!.name;
				const remaining = [...Array(selection.length + 1).keys()]
					.slice(1)
					.findIndex(
						i => prev.substring(prev.length - i) === selection.substring(0, i),
					);
				return prev + selection.slice(remaining + 1);
			});
			setRecommendations([]);
			setSelectedRecommendation(-1);
		} else if (command.trim()) {
			onCommandSubmit(command.trim());
			setCommand('');
		}
	};

	const handleCommandChange = (text: string) => {
		const commandOptions = server?.getCommandOptions(text);
		if (commandOptions && commandOptions.length > 0) {
			setRecommendations(commandOptions.map(c => ({...c, name: '/' + c.name})));
			setSelectedRecommendation(0);
		} else {
			setRecommendations([]);
		}
		setSelectedRecommendation(-1);
		setCommand(text);
	};

	useInput((input, key) => {
		// Command selection navigation
		if (recommendations.length > 0) {
			if (key.upArrow)
				setSelectedRecommendation(prev =>
					prev > 0 ? prev - 1 : recommendations.length - 1,
				);

			if (key.downArrow)
				setSelectedRecommendation(prev =>
					prev < recommendations.length - 1 ? prev + 1 : 0,
				);
		} else {
		}
	});

	let maxRecLength = Math.max(...recommendations.map(i => i.name.length));

	return (
		<Box width="100%" flexDirection="column">
			<Box flexGrow={1}>
				<Text color={colors.accentColor}>&gt; </Text>
				<TextInput
					value={command}
					onChange={handleCommandChange}
					onSubmit={handleSubmit}
					placeholder="Enter a task or /command. (Use @ for macros)"
				/>
			</Box>
			{recommendations.length > 0 ? (
				<Box flexDirection="column">
					{recommendations.map((rec, index) => (
						<Box key={`rec-${index}`} flexDirection="row">
							<Box width={3 + maxRecLength} marginRight={2} flexShrink={0}>
								<Text
									color={
										index === selectedRecommendation
											? colors.highlightColor
											: colors.textColor
									}
									bold={index === selectedRecommendation}
								>
									{(index === selectedRecommendation ? '> ' : '  ') + rec.name}
								</Text>
							</Box>
							<Box flexShrink={1}>
								<Text
									color={
										index === selectedRecommendation
											? colors.textColor
											: colors.subtextColor
									}
								>
									{rec.description}
								</Text>
							</Box>
						</Box>
					))}
					<Text></Text>
				</Box>
			) : null}
		</Box>
	);
};
