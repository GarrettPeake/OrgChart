#!/usr/bin/env node

import React from 'react';
import meow from 'meow';
import Logger from './Logger.js';
import {Interface} from './cli/Interface.js';
import {render} from 'ink';

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

render(<Interface />);
