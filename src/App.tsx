#!/usr/bin/env node

import React from 'react';
import {withFullScreen} from 'fullscreen-ink';
import meow from 'meow';
import {AgentSelector} from './interface/AgentSelector.js';
import Logger from './Logger.js';

export const cli = meow(`
	Usage
		$ orgchart

	Options
		--help, -h  Show help

	Examples
		$ orgchart
`, {
	importMeta: import.meta
});

Logger.info("======================= STARTING NEW RUN ===============================")

withFullScreen(<AgentSelector />, { exitOnCtrlC: true }).start();