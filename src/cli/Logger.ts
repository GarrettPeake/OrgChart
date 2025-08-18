import {pino} from 'pino';
import path from 'path';
import {OrgchartConfig} from '@server/dependencies/Configuration.js';

const fileTransport = pino.transport({
	target: 'pino/file',
	options: {destination: path.join(OrgchartConfig.orgchartDir, 'cli.log')},
});

const CliLogger = pino(
	{
		formatters: {
			level: label => {
				return {};
			},
			bindings: bindings => {
				return {};
			},
		},
	},
	fileTransport,
);
export default CliLogger;
