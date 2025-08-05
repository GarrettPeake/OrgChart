#!/usr/bin/env node

import React from 'react';
import {withFullScreen} from 'fullscreen-ink';
import meow from 'meow';
import {Cli} from './cli/Cli.js';
import Logger from './Logger.js';

export const cli = meow(
	`
	Usage
		$ orgchart

	Options
		--help, -h  Show help

	Examples
		$ orgchart
`,
	{
		importMeta: import.meta,
	},
);

Logger.info(
	'======================= STARTING NEW RUN ===============================',
);

withFullScreen(<Cli />, {exitOnCtrlC: true}).start();
