import React, {useState} from 'react';
import {Agent} from '../server/agents/Agents.js';
import {StartMenu} from './StartMenu.js';
import {Interface} from './Interface.js';

export const Cli: React.FC = () => {
	const [agent, setAgent] = useState<Agent | null>(null);
	const [task, setTask] = useState<string | null>(null);

	if (agent && task) {
		return <Interface task={task} agent={agent} />;
	} else {
		return <StartMenu setAgent={setAgent} setTask={setTask} />;
	}
};
