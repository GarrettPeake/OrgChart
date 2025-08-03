import React, {useReducer, useRef, useEffect, ReactNode} from 'react';
import {Box, Text, measureElement, useInput} from 'ink';
import {colors} from './Util.js';
import Markdown from './Markdown.js';
import {cleanText} from '../shared/utils/TextUtils.js';

interface EventStreamProps {
	events?: StreamEvent[];
	focused?: boolean;
	height: number;
}

export interface StreamEvent {
	title: string;
	content: string;
}

const reducer = (state: any, action: any) => {
	switch (action.type) {
		case 'SET_INNER_HEIGHT':
			return {
				...state,
				innerHeight: action.innerHeight,
				scrollTop: Math.max(action.innerHeight - state.height, 0),
			};

		case 'SCROLL_DOWN':
			return {
				...state,
				scrollTop: Math.min(
					Math.max(state.innerHeight - state.height, 0),
					state.scrollTop + 1,
				),
			};

		case 'SCROLL_UP':
			return {
				...state,
				scrollTop: Math.max(0, state.scrollTop - 1),
			};

		default:
			return state;
	}
};

interface ScrollAreaProps {
	height: number | string;
	children: ReactNode;
	focused?: boolean;
}

function ScrollArea({height, children, focused}: ScrollAreaProps) {
	const [state, dispatch] = useReducer(reducer, {
		height,
		scrollTop: 0,
	});

	const innerRef = useRef<any>(null);

	useEffect(() => {
		const dimensions = measureElement(innerRef.current);

		dispatch({
			type: 'SET_INNER_HEIGHT',
			innerHeight: dimensions.height,
		});
	}, [children]);

	useInput((_input: string, key: any) => {
		if (focused) {
			if (key.downArrow) {
				dispatch({
					type: 'SCROLL_DOWN',
				});
			}

			if (key.upArrow) {
				dispatch({
					type: 'SCROLL_UP',
				});
			}
		}
	});

	return (
		<Box height={height} flexDirection="column" overflow="hidden">
			<Box
				ref={innerRef}
				flexShrink={0}
				flexDirection="column"
				marginTop={-state.scrollTop}
				rowGap={1}
			>
				{children}
			</Box>
		</Box>
	);
}

export const EventStream = ({
	events = [],
	focused = false,
	height,
}: EventStreamProps) => (
	<Box flexDirection="column" paddingX={1} height={height}>
		<ScrollArea height={height} focused={focused}>
			{events.map((event, index) => (
				<Box key={`event-${index}`} flexDirection="column">
					<Text bold color={colors.accentColor}>
						• {event.title}
					</Text>
					{event.content ? (
						<Box marginLeft={2} flexDirection="column">
							<Markdown>{cleanText(event.content)}</Markdown>
						</Box>
					) : null}
				</Box>
			))}
		</ScrollArea>
	</Box>
);
