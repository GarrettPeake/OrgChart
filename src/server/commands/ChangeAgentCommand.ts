import {agents} from '@server/agents/Agents.js';
import {BaseCommand, CommandResult} from './BaseCommand.js';
import {PromiseServer} from '../PromiseServer.js';

export class ChangeAgentCommand extends BaseCommand {
	name = 'agent';
	description = 'Change the top-level agent';

	async execute(args: string[], server: PromiseServer): Promise<CommandResult> {
		if (args.length !== 1) {
			return this.error(
				`/${this.name} accepts exactly one argument, ${args.length} provided`,
			);
		}
		if (!Object.keys(agents).includes(args[0]!)) {
			return this.error(`${args[0]} is not a known agent id`);
		}
		server.setAgentOverride(args[0] as any);
		return this.success(`Set top-level agent to ${args[0]}`);
	}

	getAvailableCommands(): {name: string; description: string}[] {
		return Object.entries(agents).map(([id, agent]) => ({
			name: `${this.name} ${id}`,
			description: agent.human_description,
		}));
	}
}
