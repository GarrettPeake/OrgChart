import {execSync} from 'child_process';
import {ToolDefinition} from './index.js';
import Logger from '../../Logger.js';
import {StreamEvent} from '../../cli/EventStream.js';

export const bashToolName = 'Bash';

const descriptionForAgent = `Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the requester's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Commands will be executed in the current working directory.`;

export const bashToolDefinition: ToolDefinition = {
	name: bashToolName,
	descriptionForAgent: descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				description:
					'The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.',
			},
			requires_approval: {
				type: 'boolean',
				description:
					"A boolean indicating whether this command requires explicit user approval before execution in case the user has auto-approve mode enabled. Set to 'true' for potentially impactful operations like installing/uninstalling packages, deleting/overwriting files, system configuration changes, network operations, or any commands that could have unintended side effects. Set to 'false' for safe operations like reading files/directories, running development servers, building projects, and other non-destructive operations.",
			},
		},
		required: ['command', 'requires_approval'],
	},
	enact: async (args: {
		command: string;
		requires_approval: boolean;
	}): Promise<string> => runCommandSafely(args.command),
	formatEvent: async (args: {
		command: string;
		requires_approval: boolean;
	}): Promise<StreamEvent> => ({title: `Bash(${args.command})`, content: ''}), // TODO: Update event to append result
};

function runCommandSafely(command: string): string {
	Logger.info(`Executing command: ${command}`);
	if (
		command.includes('rm -rf') ||
		command.includes('~') ||
		command.includes('shutdown')
	) {
		Logger.info(`Blocking execution of: ${command}`);
		return "Unable to execute commands matching ['rm -rf', '~', 'shutdown']";
	}
	const stdout = execSync(command, {
		timeout: 10000,
	});
	let result = new TextDecoder('utf-8').decode(stdout);
	Logger.info(`Command result: ${result}`);
	return result;
}
