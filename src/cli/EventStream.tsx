import React from 'react';
import {Box, Text} from 'ink';
import {colors} from '@cli/Util.js';
import Markdown from '@cli/Markdown.js';
import {OrgchartEvent} from '@server/IOTypes.js';

interface EventStreamProps {
	events?: OrgchartEvent[];
}

// const reducer = (state: any, action: any) => {
// 	switch (action.type) {
// 		case 'SET_INNER_HEIGHT':
// 			return {
// 				...state,
// 				innerHeight: action.innerHeight,
// 				scrollTop: Math.max(action.innerHeight - state.height, 0),
// 			};

// 		case 'SCROLL_DOWN':
// 			return {
// 				...state,
// 				scrollTop: Math.min(
// 					Math.max(state.innerHeight - state.height, 0),
// 					state.scrollTop + 1,
// 				),
// 			};

// 		case 'SCROLL_UP':
// 			return {
// 				...state,
// 				scrollTop: Math.max(0, state.scrollTop - 1),
// 			};

// 		default:
// 			return state;
// 	}
// };

// interface ScrollAreaProps {
// 	height: number | string;
// 	children: ReactNode;
// 	focused?: boolean;
// }

// function ScrollArea({height, children, focused}: ScrollAreaProps) {
// 	const [state, dispatch] = useReducer(reducer, {
// 		height,
// 		scrollTop: 0,
// 	});

// 	const innerRef = useRef<any>(null);

// 	useEffect(() => {
// 		const dimensions = measureElement(innerRef.current);

// 		dispatch({
// 			type: 'SET_INNER_HEIGHT',
// 			innerHeight: dimensions.height,
// 		});
// 	}, [children]);

// 	useInput((_input: string, key: any) => {
// 		if (focused) {
// 			if (key.downArrow) {
// 				dispatch({
// 					type: 'SCROLL_DOWN',
// 				});
// 			}

// 			if (key.upArrow) {
// 				dispatch({
// 					type: 'SCROLL_UP',
// 				});
// 			}
// 		}
// 	});

// 	return (
// 		<Box height={height} flexDirection="column" overflow="hidden">
// 			<Box
// 				ref={innerRef}
// 				flexShrink={0}
// 				flexDirection="column"
// 				marginTop={-state.scrollTop}
// 				rowGap={1}
// 			>
// 				{children}
// 			</Box>
// 		</Box>
// 	);
// }

const cleanText = (text: string): string => {
	return text
		.split('\n')
		.map(e => e.trimEnd())
		.map(e => e.replaceAll('\t', '  '))
		.join('\n');
};

export const EventStream = ({events = []}: EventStreamProps) => (
	<Box flexDirection="column" paddingX={1}>
		{events.map((event, index) => (
			<Box key={`event-${index}`} flexDirection="column" marginBottom={1}>
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
		))}
	</Box>
);
