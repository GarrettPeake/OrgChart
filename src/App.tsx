#!/usr/bin/env node

import React from 'react';
import {withFullScreen} from 'fullscreen-ink';
import meow from 'meow';
import Logger from './Logger.js';
import { Interface } from './cli/Interface.js';

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

withFullScreen(<Interface/>, {exitOnCtrlC: true}).start();
