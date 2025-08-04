import React, {useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {colors} from './Util.js';

export interface CommandPanelConfiguration {
	status: CommandPanelStatus;
	options?: string[];
	textOption?: boolean;
}

export type CommandPanelStatus = 'text' | 'options';

interface CommandPanelProps {
	onCommandSubmit: (command: string) => void;
	configuration: CommandPanelConfiguration;
}

export const CommandPanel: React.FC<CommandPanelProps> = ({
	onCommandSubmit,
	configuration,
}) => {
	const [command, setCommand] = useState('');

	const handleSubmit = () => {
		if (command.trim()) {
			onCommandSubmit(command.trim());
			setCommand('');
		}
	};

	return (
		<Box width="100%">
			<Text color={colors.accentColor}>&gt; </Text>
			<Box flexGrow={1}>
				<TextInput
					value={command}
					onChange={setCommand}
					onSubmit={handleSubmit}
					placeholder="Enter command..."
				/>
			</Box>
		</Box>
	);
};
