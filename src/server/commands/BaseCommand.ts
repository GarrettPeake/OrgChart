import {PromiseServer} from '../PromiseServer.js';

export interface CommandResult {
	success: boolean;
	message: string;
	data?: any;
}

export abstract class BaseCommand {
	abstract name: string;
	abstract description: string;

	abstract execute(
		args: string[],
		server: PromiseServer,
	): Promise<CommandResult>;

	abstract getAvailableCommands(): {name: string; description: string}[];

	protected parseArgs(input: string): string[] {
		return input
			.trim()
			.split(/\s+/)
			.filter(arg => arg.length > 0);
	}

	protected success(message: string, data?: any): CommandResult {
		return {success: true, message, data};
	}

	protected error(message: string): CommandResult {
		return {success: false, message};
	}
}
