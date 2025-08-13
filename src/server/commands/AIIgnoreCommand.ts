import {BaseCommand, CommandResult} from './BaseCommand.js';
import {getFileTree} from '../utils/FileSystemUtils.js';
import {getConfig} from '../utils/Configuration.js';
import Logger from '@/Logger.js';
import fs from 'fs/promises';

const SYSTEM_PROMPT = `
You are an expert in software development and project structure analysis.
You will be provided with file trees and you must determine which files AI assistants typically won't need access to for code analysis and assistance.
The file tree will also contain the token count of each file, if the token count is very high for a single file, it is likely best to add an ignore path for it.
You should only ignore files that are displayed in the file tree. 

You want to focus on:
- Build artifacts (dist/, build/, out/)
- License files (LICENSE, LICENSE.md, licenses from other projects included for attribution purposes)
- Package management files (node_modules/, .pnpm-store/)
- Lock files (package-lock.json, yarn.lock, pnpm-lock.yaml)
- Cache directories (.cache/, .temp/)
- IDE/editor files (.vscode/, .idea/)
- OS files (.DS_Store, Thumbs.db)
- Log files (*.log, logs/)
- Test coverage (coverage/, .nyc_output/)
- Environment files (.env.local, .env.production)
`;

export class AIIgnoreCommand extends BaseCommand {
	name = 'aiignore';
	description =
		'Generate AI-focused ignore patterns using GPT analysis of the file tree';

	async execute(args: string[]): Promise<CommandResult> {
		try {
			Logger.info('Starting AI ignore analysis...');

			// Get the current file tree with token counts
			const fileTree = getFileTree(undefined, 15, true);
			const config = getConfig();

			// Use the gpt-oss model to analyze the file tree
			const response = await config.llmProvider.chatCompletion(
				{
					model: 'openai/gpt-oss-120b',
					messages: [
						{
							role: 'system',
							content: SYSTEM_PROMPT,
						},
						{
							role: 'user',
							content: fileTree,
						},
					],
					temperature: 0.2,
					stream: false,
					provider: {
						sort: 'throughput',
					},
					response_format: {
						type: 'json_schema',
						json_schema: {
							name: 'aiignore_patterns',
							strict: true,
							schema: {
								type: 'object',
								properties: {
									patterns: {
										type: 'array',
										items: {
											type: 'string',
										},
										description:
											'Array of gitignore-style patterns for files/directories AI should ignore',
									},
									reasoning: {
										type: 'string',
										description:
											'Brief explanation of the patterns chosen and why they help reduce AI context noise',
									},
								},
								required: ['patterns', 'reasoning'],
								additionalProperties: false,
							},
						},
					},
				},
				[],
			);

			const choice = response?.choices?.[0];
			const message = choice?.message?.content;

			if (!message) {
				return this.error('No response received from AI model');
			}

			// Parse the structured JSON response
			let result;
			try {
				result = JSON.parse(message);
			} catch (parseError) {
				Logger.error('Failed to parse AI response:', parseError);
				return this.error('Failed to parse AI response as JSON');
			}

			// Validate the structured response (should be guaranteed by schema)
			if (!result.patterns || !Array.isArray(result.patterns)) {
				return this.error('Invalid response format from AI model');
			}

			// Save the patterns to .aiignore file
			const content = [
				'# AI-generated ignore patterns',
				`# Generated on: ${new Date().toISOString()}`,
				`# Reasoning: ${result.reasoning}`,
				'',
				...result.patterns,
			].join('\n');

			await fs.writeFile(config.aiIgnoreFile, content, 'utf8');

			Logger.info(`Generated ${result.patterns.length} AI ignore patterns`);

			return this.success(
				`Generated ${result.patterns.length} AI ignore patterns and saved to .aiignore`,
				{
					patterns: result.patterns,
					reasoning: result.reasoning,
					filePath: config.aiIgnoreFile,
				},
			);
		} catch (error) {
			Logger.error('Error in AI ignore analysis:', error);
			return this.error(
				`Failed to analyze file tree: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
}
