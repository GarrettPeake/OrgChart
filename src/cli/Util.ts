import {useStdout} from 'ink';
import {useEffect, useState} from 'react';

export const colors = {
	highlightColor: '#ff8604',
	accentColor: '#d16c00',
	textColor: '#ffe6be',
	subtextColor: '#b8aea0',
};

export const useStdOutDim = () => {
	const {stdout} = useStdout();
	const [screenDimensions, setDimensions] = useState<[number, number]>([
		stdout.columns,
		stdout.rows,
	]);

	// Add a resize handler to the terminal window
	useEffect(() => {
		const handler = () => setDimensions([stdout.columns, stdout.rows]);
		stdout.on('resize', handler);
		return () => {
			stdout.off('resize', handler);
		};
	}, [stdout]);
	return screenDimensions;
};
