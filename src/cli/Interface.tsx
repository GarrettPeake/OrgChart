import React, {useState, useCallback, useEffect} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {Agent} from '../server/agents/Agents.js';
import {AgentTree} from './AgentTree.js';
import {StreamEvent, EventStream} from './EventStream.js';
import {CommandPanel} from './CommandPanel.js';
import {TaskAgent} from '../server/tasks/TaskAgent.js';
import {LLMProvider} from '../server/LLMProvider.js';
import Logger, {initContextLogger} from '../Logger.js';
import {colors, useStdOutDim} from './Util.js';

type FocusSection = 'agentTree' | 'eventStream';

interface InterfaceProps {
	agent: Agent;
	task: string;
}

export const Interface: React.FC<InterfaceProps> = ({agent, task}) => {
	const currentDir = process.cwd();
	const {stdout} = useStdout();
	const screenDimensions = useStdOutDim();
	const [events, setEvents] = useState<StreamEvent[]>([]);
	const [totalCost, setTotalCost] = useState<number>(0);
	const [taskRunner, setTaskRunner] = useState<TaskAgent | null>(null);
	const [taskPromise, setTaskPromise] = useState<Promise<string> | null>(null);
	const [focusedSection, setFocusedSection] =
		useState<FocusSection>('eventStream');
	const [runId, _] = useState(crypto.randomUUID());

	const writeEvent = useCallback((event: StreamEvent) => {
		setEvents(prev => [...prev, event]);
	}, []);

	const handleCommandSubmit = async (command: string) => {
		// Add the command to the event stream
		writeEvent({title: 'Command', content: command});
		if (taskRunner !== null) {
			setTaskPromise(taskRunner.runTask(command));
		} else {
			throw 'Failed to initialize agent for task';
		}
	};

	// Handle tab key navigation
	useInput((input, key) => {
		if (key.tab) {
			setFocusedSection(prevFocus => {
				switch (prevFocus) {
					case 'agentTree':
						return 'eventStream';
					case 'eventStream':
						return 'agentTree';
					default:
						return 'eventStream';
				}
			});
		}
		if (key.escape) {
			// TODO: This should find the currently executing child and stop the promise. That will prevent the currently executing
			writeEvent({title: 'Stopping agent', content: ''});
			return;
		}
	});

	useEffect(() => {
		// Initialize LLMProvider and TaskRunner when component mounts
		Logger.info(`Using ${agent.name} to execute: '${task}'`);
		try {
			const llmProvider = new LLMProvider();
			const runner = new TaskAgent(llmProvider, writeEvent, agent);
			setTaskRunner(runner);
			initContextLogger(runId, runner);

			// Start the task
			setTaskPromise(runner.runTask(task));
		} catch (error) {
			Logger.error(error, 'Failed to initialize and start task');
			writeEvent({
				title: 'Initialization Error',
				content:
					error instanceof Error ? error.message : 'Unknown error occurred',
			});
		}
	}, [agent, task, writeEvent]);

	const headerHeight = 5; // 3 lines of text plus border
	const topMargin = 1;
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
				<Box flexDirection="column">
					<Text bold color={colors.accentColor}>
						OrgChart - {agent.name}
					</Text>
					<Text color={colors.subtextColor}>
						Working Directory: {currentDir}
					</Text>
					<Text color={colors.subtextColor}>
						RunId: {runId}, Total Cost: ${totalCost.toFixed(2)}
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
					borderColor={
						focusedSection === 'agentTree'
							? colors.highlightColor
							: colors.subtextColor
					}
					flexDirection="column"
					height={bodyHeight}
				>
					<AgentTree rootTaskRunner={taskRunner} />
				</Box>

				{/* Right column - Event Stream */}
				<Box
					flexGrow={1}
					borderStyle="round"
					borderDimColor
					borderColor={
						focusedSection === 'eventStream'
							? colors.highlightColor
							: colors.subtextColor
					}
					flexDirection="column"
					height={bodyHeight}
					overflow="hidden"
				>
					<EventStream
						events={events}
						focused={focusedSection === 'eventStream'}
						height={bodyHeight - 2}
					/>
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
