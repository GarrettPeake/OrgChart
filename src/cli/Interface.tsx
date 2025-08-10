import React, {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {AgentTree} from '@cli/AgentTree.js';
import {EventStream} from '@cli/EventStream.js';
import {CommandPanel} from '@cli/CommandPanel.js';
import {colors, useStdOutDim} from '@cli/Util.js';
import {getAgentTypes, PromiseServer} from '@server/PromiseServer.js';
import {CommandType, OrgchartEvent} from '@server/IOTypes.js';
import Logger from '@/Logger.js';

interface InterfaceProps {
	agent: string;
	task: string;
}

export const Interface: React.FC<InterfaceProps> = ({agent, task}) => {
	const [rootAgentInfo, setRootAgentInfo] = useState(
		getAgentTypes().find(e => e.id === agent)!,
	);
	const [server, setServer] = useState<PromiseServer>();
	const currentDir = process.cwd();
	const screenDimensions = useStdOutDim();
	const [totalCost, setTotalCost] = useState<number>(0);
	const [events, setEvents] = useState<OrgchartEvent[]>([]);

	// Initialize the server
	useEffect(() => {
		setServer(new PromiseServer(agent, task));
	}, [agent, task]);

	// Refresh state from the server through polling
	useEffect(() => {
		if (!server) return;

		const interval = setInterval(() => {
			const newEventsJson = JSON.stringify(server.getEvents());
			if (newEventsJson !== JSON.stringify(events)) {
				setEvents(JSON.parse(newEventsJson));
			}
		}, 250);

		return () => clearInterval(interval);
	}, [server]);

	const handleCommandSubmit = async (command: string) => {
		server!.sendCommand({type: CommandType.TASK, task: command});
	};

	// Handle tab key navigation
	useInput((_, key) => {
		if (key.escape) {
			server?.pause(); // TODO: When do we stop an agent?
		}
	});

	const headerHeight = 5; // 3 lines of text plus border
	const topMargin = 0;
	const footerHeight = 6; // 4 lines of text plus border
	const bottomMargin = 0;
	const bodyHeight = Math.max(
		screenDimensions[1] -
			headerHeight -
			footerHeight -
			topMargin -
			bottomMargin,
		0,
	);

	return (
		<Box
			flexDirection="column"
			flexGrow={1}
			height={screenDimensions[1]}
			width={screenDimensions[0]}
			overflow="hidden"
		>
			{/* Header */}
			<Box
				borderStyle="round"
				borderDimColor
				flexShrink={0}
				height={headerHeight}
				marginTop={topMargin}
				paddingX={1}
			>
				<Box flexDirection="column" width={screenDimensions[0] - 2}>
					<Text bold color={colors.accentColor}>
						OrgChart - {rootAgentInfo.name}
					</Text>
					<Text color={colors.subtextColor}>
						Working Directory: {currentDir}
					</Text>
					<Text color={colors.subtextColor}>
						RunId: {server?.getRunId()}, Total Cost: ${totalCost.toFixed(2)}
					</Text>
				</Box>
			</Box>

			{/* Main content - two columns */}
			<Box flexGrow={1} gap={0.5} overflow="hidden">
				{/* Left column - Agent Tree */}
				<Box
					borderStyle="round"
					flexShrink={1}
					borderDimColor
					width={75}
					borderColor={colors.subtextColor}
					flexDirection="column"
					height={bodyHeight}
				>
					<AgentTree rootTaskRunner={server?.getAgentGraph()} />
				</Box>

				{/* Right column - Event Stream */}
				<Box
					flexGrow={1}
					borderStyle="round"
					borderDimColor
					borderColor={colors.subtextColor}
					flexDirection="column"
					height={bodyHeight}
					overflow="hidden"
				>
					<EventStream events={events} height={bodyHeight - 2} />
				</Box>
			</Box>

			{/* Footer - Command Panel */}
			<Box
				flexShrink={0}
				borderStyle="round"
				borderDimColor
				borderColor={colors.subtextColor}
				marginBottom={bottomMargin}
				height={footerHeight}
			>
				<CommandPanel onCommandSubmit={handleCommandSubmit} />
			</Box>
		</Box>
	);
};
