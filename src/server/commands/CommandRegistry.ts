import {BaseCommand, CommandResult} from './BaseCommand.js';
import {AIIgnoreCommand} from './AIIgnoreCommand.js';

export class CommandRegistry {
	private commands: Map<string, BaseCommand> = new Map();

	constructor() {
		this.registerCommand(new AIIgnoreCommand());
	}

	private registerCommand(command: BaseCommand): void {
		this.commands.set(command.name.toLowerCase(), command);
	}

	public async executeCommand(input: string): Promise<CommandResult> {
		const trimmed = input.trim();
		if (!trimmed.startsWith('/')) {
			return {success: false, message: 'Commands must start with /'};
		}

		const commandParts = trimmed.slice(1).split(/\s+/);
		const commandName = commandParts[0]?.toLowerCase();
		const args = commandParts.slice(1);

		if (!commandName) {
			return {success: false, message: 'No command specified'};
		}

		const command = this.commands.get(commandName);
		if (!command) {
			return {success: false, message: `Unknown command: ${commandName}`};
		}

		try {
			return await command.execute(args);
		} catch (error) {
			return {
				success: false,
				message: `Error executing command ${commandName}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			};
		}
	}

	public listCommands(): {name: string; description: string}[] {
		return Array.from(this.commands.values()).map(cmd => ({
			name: cmd.name,
			description: cmd.description,
		}));
	}

	public isCommand(input: string): boolean {
		return input.trim().startsWith('/');
	}
}
