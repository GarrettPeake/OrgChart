#!/usr/bin/env node

import React from 'react';
import meow from 'meow';
import ServerLogger from '@server/dependencies/Logger.js';
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

ServerLogger.info(
	'======================= STARTING NEW RUN ===============================',
);

render(<Interface />);
