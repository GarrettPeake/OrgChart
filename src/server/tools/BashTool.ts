import {spawnSync} from 'child_process';
import {ToolDefinition} from './index.js';
import ServerLogger from '@server/dependencies/Logger.js';
import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {OrgchartConfig} from '@server/dependencies/Configuration.js';
import {TaskAgent} from '../tasks/TaskAgent.js';
import {AgentContext} from '../tasks/AgentContext.js';
import {LLMProvider} from '../dependencies/provider/index.js';

export const bashToolName = 'Bash';

const descriptionForAgent = `Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the requester's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Commands will be executed in the current working directory. Set return_raw_results to false unless you absolutely need the complete raw output - this will provide a concise summary instead.`;

export const bashToolDefinition: ToolDefinition = {
	name: bashToolName,
	descriptionForAgent: descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description:
					'A brief explanation (1-2 sentences) of why you need to run this command and what it will accomplish.',
			},
			command: {
				type: 'string',
				description:
					'The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.',
			},
			followup_input: {
				type: 'array',
				description:
					'Array of followup inputs to be sent to the command being executed. For instance for `npm init` you can provide the package name, version, etc. to be entered into the interactive process.',
				items: {
					type: 'string',
					description:
						'An input to be sent, ANSI escape codes are supported, \\n can be used as the enter key',
				},
			},
			requires_approval: {
				type: 'boolean',
				description:
					"A boolean indicating whether this command requires explicit user approval before execution in case the user has auto-approve mode enabled. Set to 'true' for potentially impactful operations like installing/uninstalling packages, deleting/overwriting files, system configuration changes, network operations, or any commands that could have unintended side effects. Set to 'false' for safe operations like reading files/directories, running development servers, building projects, and other non-destructive operations.",
			},
			return_raw_results: {
				type: 'boolean',
				description:
					'Set to false (recommended) to receive a concise summary of command results. Set to true only when you absolutely need the complete raw output for further processing.',
				default: false,
			},
		},
		required: ['reasoning', 'command', 'requires_approval'],
	},
	enact: async (
		args: {
			reasoning: string;
			command: string;
			requires_approval: boolean;
			followup_input?: string[];
			return_raw_results?: boolean;
		},
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	): Promise<string> => {
		writeEvent({
			title: `Bash(${args.command})`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.reasoning,
				},
				{
					type: DisplayContentType.TEXT,
					content: `Command: ${args.command}`,
				},
				{
					type: DisplayContentType.TEXT,
					content: `Additional Inputs: ${args.followup_input || 'None'}`,
				},
				{
					type: DisplayContentType.TEXT,
					content: `Summarize: ${!args.return_raw_results}`,
				},
			],
		});

		const rawResult = runCommandSafely(args.command, args.followup_input);

		// If return_raw_results is true, return raw results
		if (args.return_raw_results === true) {
			return rawResult;
		}

		// Otherwise, summarize the results using LLM
		return await summarizeCommandResults(args.command, rawResult, invoker);
	},
};

async function summarizeCommandResults(
	command: string,
	rawResult: string,
	invoker: TaskAgent,
): Promise<string> {
	if (!rawResult || rawResult.trim().length === 0) {
		return 'Command executed successfully with no output.';
	}

	// For short results (less than 200 chars), return as-is
	if (rawResult.length < 200) {
		return rawResult;
	}

	try {
		// Create a new context for summarization
		const summaryContext = new AgentContext([]);
		summaryContext.addSystemBlock(`You are summarizing the output of a bash command. Provide a concise summary that captures the key information while being much shorter than the original output. Focus on:
- Success/failure status
- Key results or findings  
- Any errors or warnings
- Important numbers, counts, or metrics
- Any actionable information

Keep the summary under 3-4 sentences unless the output contains complex information that requires more detail.`);
		summaryContext.addUserBlock(`Command: ${command}\n\nOutput:\n${rawResult}`);

		return await LLMProvider.getNonToolResponse(
			summaryContext,
			'openai/gpt-oss-120b',
		);
	} catch (error) {
		ServerLogger.error('Error summarizing command results:', error);
		return rawResult; // Fallback to raw results if summarization fails
	}
}

function runCommandSafely(command: string, inputs?: string[]): string {
	ServerLogger.info(`Executing command: ${command}`);
	if (
		command.includes('rm -rf') ||
		command.includes('~') ||
		command.includes('shutdown')
	) {
		ServerLogger.info(`Blocking execution of: ${command}`);
		return "Unable to execute commands matching ['rm -rf', '~', 'shutdown']";
	}
	const result = spawnSync(command, {
		cwd: OrgchartConfig.workingDir,
		input: inputs?.join(''),
		shell: true,
		timeout: 10000,
		encoding: 'utf-8',
	}).stdout;

	ServerLogger.info(`Command result: ${result}`);
	return result;
}
