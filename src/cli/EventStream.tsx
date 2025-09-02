import React from 'react';
import {Box, Static, Text} from 'ink';
import {colors} from '@cli/Util.js';
import Markdown from '@cli/Markdown.js';
import {OrgchartEvent} from '@server/IOTypes.js';

interface EventStreamProps {
	events?: OrgchartEvent[];
}

interface EventStreamItemProps {
	event: OrgchartEvent;
	index: number;
}

const cleanText = (text: string): string => {
	return text
		.split('\n')
		.map(e => e.trimEnd())
		.map(e => e.replaceAll('\t', '  '))
		.join('\n');
};

const EventStreamItem = ({event, index}: EventStreamItemProps) => (
	<Box flexDirection="column" marginBottom={1}>
		<Text bold color={colors.accentColor}>
			• {event.title}
		</Text>
		<Box marginLeft={2} flexDirection="column">
			{event.content.map((contentChunk, chunkIndex) => (
				<Markdown key={`content-${index}-${chunkIndex}`}>
					{cleanText(contentChunk.content)}
				</Markdown>
			))}
		</Box>
	</Box>
);

export const EventStream = ({events = []}: EventStreamProps) => (
	<Box flexDirection="column" paddingX={1}>
		<Static items={events.slice(0, -1)}>
			{(event, index) => (
				<EventStreamItem key={index} event={event} index={index} />
			)}
		</Static>
		{events.length > 0 ? (
			<EventStreamItem
				event={events[events.length - 1]!}
				index={events.length}
			/>
		) : undefined}
	</Box>
);
