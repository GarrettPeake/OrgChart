import React, {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {AgentTree} from '@cli/AgentTree.js';
import {EventStream} from '@cli/EventStream.js';
import {CommandPanel} from '@cli/CommandPanel.js';
import {colors, useStdOutDim} from '@cli/Util.js';
import {PromiseServer} from '@server/PromiseServer.js';
import {OrgchartEvent} from '@server/IOTypes.js';
import BigText from 'ink-big-text';

export const Interface = () => {
	const [server, setServer] = useState<PromiseServer>();
	const currentDir = process.cwd();
	const screenDimensions = useStdOutDim();
	const [totalCost, setTotalCost] = useState<number>(0);
	const [events, setEvents] = useState<OrgchartEvent[]>([]);
	const [rootAgent, setRootAgent] = useState(server?.getAgentGraph());

	// Initialize the server
	useEffect(() => {
		setServer(new PromiseServer());
	}, []);

	// Refresh state from the server through polling
	useEffect(() => {
		if (!server) return;

		const interval = setInterval(() => {
			const newEventsJson = JSON.stringify(server.getEvents());
			if (newEventsJson !== JSON.stringify(events)) {
				setEvents(JSON.parse(newEventsJson));
			}
			const newTotalSpend = server.getTotalSpend();
			if (newTotalSpend !== totalCost) {
				setTotalCost(newTotalSpend);
			}
			setRootAgent(server.getAgentGraph());
		}, 250);

		return () => clearInterval(interval);
	}, [server, events, totalCost]);

	const handleCommandSubmit = async (command: string) => {
		server!.sendCommand(command);
	};

	// Handle tab key navigation
	useInput((_, key) => {
		if (key.escape) {
			server?.pause();
		}
	});

	const bottomMargin = 0;

	return (
		<Box flexDirection="column" flexGrow={1} width={screenDimensions[0]}>
			{server?.getAgentGraph() ? null : (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderDimColor
					borderColor={colors.highlightColor}
					flexShrink={1}
				>
					<Box marginBottom={-1} marginLeft={3}>
						<Text color={colors.accentColor}>Welcome to the</Text>
					</Box>
					<BigText
						colors={[colors.highlightColor, colors.subtextColor]}
						text="ORGCHART"
					/>
				</Box>
			)}
			<EventStream events={events} />

			{server?.getAgentGraph() ? (
				<Box
					borderStyle="round"
					flexShrink={1}
					borderDimColor
					width={screenDimensions[0]}
					paddingLeft={1}
					borderColor={colors.subtextColor}
					flexDirection="column"
				>
					<Box flexDirection={'row'} gap={2}>
						<Text bold color={colors.accentColor}>
							OrgChart
						</Text>
						<Text color={colors.subtextColor}>
							Working Directory: {currentDir}
						</Text>
						<Text color={colors.subtextColor}>
							{`RunId: ${server?.getRunId()}, Total Cost: ${totalCost.toFixed(
								2,
							)}`}
						</Text>
					</Box>
					<AgentTree rootTaskRunner={rootAgent} />
				</Box>
			) : null}

			{/* Footer - Command Panel */}
			<Box
				flexShrink={0}
				borderStyle="round"
				borderDimColor
				borderColor={colors.subtextColor}
				marginBottom={bottomMargin}
			>
				<CommandPanel onCommandSubmit={handleCommandSubmit} server={server} />
			</Box>
		</Box>
	);
};
