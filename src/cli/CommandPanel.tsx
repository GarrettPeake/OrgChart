import React, {useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {colors} from '@cli/Util.js';

export type CommandPanelStatus = 'text' | 'options';

interface CommandPanelProps {
	onCommandSubmit: (command: string) => void;
}

export const CommandPanel: React.FC<CommandPanelProps> = ({
	onCommandSubmit,
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
