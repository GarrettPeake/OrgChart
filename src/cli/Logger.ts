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
			level: _ => {
				return {};
			},
			bindings: _ => {
				return {};
			},
		},
	},
	fileTransport,
);
export default CliLogger;
