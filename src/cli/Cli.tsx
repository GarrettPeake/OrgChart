import React, {useState} from 'react';
import {StartMenu} from '@cli/StartMenu.js';
import {Interface} from '@cli/Interface.js';

export const Cli: React.FC = () => {
	const [agent, setAgent] = useState<string | null>(null);
	const [task, setTask] = useState<string | null>(null);

	if (agent && task) {
		return <Interface task={task} agent={agent} />;
	} else {
		return <StartMenu setAgent={setAgent} setTask={setTask} />;
	}
};
