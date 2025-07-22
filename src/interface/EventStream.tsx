import React, {useReducer, useRef, useEffect} from 'react';
import {Box, Text, measureElement, useInput} from 'ink';
import { colors } from './index.js';

interface EventStreamProps {
	events?: StreamEvent[];
	focused?: boolean;
	height: number
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
				scrollTop: Math.max(state.innerHeight - state.height, 0)
			};

		case 'SCROLL_DOWN':
			return {
				...state,
				scrollTop: Math.min(
					Math.max(state.innerHeight - state.height, 0),
					state.scrollTop + 1
				)
			};

		case 'SCROLL_UP':
			return {
				...state,
				scrollTop: Math.max(0, state.scrollTop - 1)
			};

		default:
			return state;
	}
};

interface ScrollAreaProps {
	height: number | string;
	children: React.ReactNode;
	focused?: boolean;
}

const ScrollArea: React.FC<ScrollAreaProps> = ({height, children, focused = false}) => {
	const [state, dispatch] = useReducer(reducer, {
		height,
		scrollTop: 0
	});

	const innerRef = useRef<any>(null);

	useEffect(() => {
		if (innerRef.current) {
			const dimensions = measureElement(innerRef.current);

			dispatch({
				type: 'SET_INNER_HEIGHT',
				innerHeight: dimensions.height
			});
		}
	}, [children]);

	useInput((_input: string, key: any) => {
		if (!focused) return;
		
		if (key.downArrow) {
			dispatch({
				type: 'SCROLL_DOWN'
			});
		}

		if (key.upArrow) {
			dispatch({
				type: 'SCROLL_UP'
			});
		}
	}, {
		isActive: focused
	});

	return (
		<Box height={height} flexDirection="column" overflow="hidden">
			<Box
				ref={innerRef}
				flexShrink={0}
				flexDirection="column"
				marginTop={-state.scrollTop}
			>
				{children}
			</Box>
		</Box>
	);
};

export const EventStream = ({events = [], focused = false, height}: EventStreamProps) => (
	<Box flexDirection="column" paddingX={1} flexGrow={1} height={height}>
		<ScrollArea height={height} focused={focused}>
			{...events.map((event, index) => (
				<Box key={`event-${index}`} flexDirection="column" marginTop={1}>
					<Text bold color={colors.accentColor}>• {event.title}</Text>
					{ event.content ?
						<Box key={`event-${index}`} marginLeft={2} flexDirection="column">
							<Text color={colors.subtextColor}>{event.content}</Text>
						</Box> : null}
				</Box>
			))}
		</ScrollArea>
	</Box>
);