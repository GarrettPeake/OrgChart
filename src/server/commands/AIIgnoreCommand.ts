import {BaseCommand, CommandResult} from './BaseCommand.js';
import {getFileTree} from '../utils/FileSystemUtils.js';
import {getConfig} from '../utils/Configuration.js';
import Logger from '@/Logger.js';
import fs from 'fs/promises';
import path from 'path';

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

			// Create a prompt for the AI to analyze the file structure
			const prompt = this.createAnalysisPrompt(fileTree);

			// Use the gpt-oss model to analyze the file tree
			const response = await config.llmProvider.chatCompletion(
				{
					model: 'openai/gpt-oss-120b',
					messages: [
						{
							role: 'system',
							content: `You are an expert in software development and project structure analysis. Your task is to analyze a file tree and generate gitignore-style patterns for files and directories that AI assistants typically don't need access to for code analysis and assistance.

Focus on:
- Build artifacts (dist/, build/, out/)
- Package management files (node_modules/, .pnpm-store/)
- Lock files (package-lock.json, yarn.lock, pnpm-lock.yaml)
- Cache directories (.cache/, .temp/)
- IDE/editor files (.vscode/, .idea/)
- OS files (.DS_Store, Thumbs.db)
- Log files (*.log, logs/)
- Test coverage (coverage/, .nyc_output/)
- Environment files (.env.local, .env.production)

Return ONLY a JSON object with this structure:
{
  "patterns": ["pattern1", "pattern2", ...],
  "reasoning": "Brief explanation of the patterns chosen"
}`,
						},
						{
							role: 'user',
							content: prompt,
						},
					],
					temperature: 0.2,
					stream: false,
					provider: {
						sort: 'throughput',
					},
				},
				[],
			);

			const choice = response?.choices?.[0];
			const message = choice?.message?.content;

			if (!message) {
				return this.error('No response received from AI model');
			}

			// Parse the JSON response
			let result;
			try {
				result = JSON.parse(message);
			} catch (parseError) {
				Logger.error('Failed to parse AI response:', parseError);
				return this.error('Failed to parse AI response as JSON');
			}

			if (!result.patterns || !Array.isArray(result.patterns)) {
				return this.error('Invalid response format from AI model');
			}

			// Save the patterns to .aiignore file
			const aiIgnorePath = path.join(config.rootDir, '.aiignore');
			const content = [
				'# AI-generated ignore patterns',
				`# Generated on: ${new Date().toISOString()}`,
				`# Reasoning: ${result.reasoning}`,
				'',
				...result.patterns,
			].join('\n');

			await fs.writeFile(aiIgnorePath, content, 'utf8');

			Logger.info(`Generated ${result.patterns.length} AI ignore patterns`);

			return this.success(
				`Generated ${result.patterns.length} AI ignore patterns and saved to .aiignore`,
				{
					patterns: result.patterns,
					reasoning: result.reasoning,
					filePath: aiIgnorePath,
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

	private createAnalysisPrompt(fileTree: string): string {
		return `Please analyze the following file tree structure with token counts and generate gitignore-style patterns for files and directories that AI assistants typically don't need for code analysis and development assistance.

File tree with token counts:

\`\`\`
${fileTree}
\`\`\`

Generate patterns that would exclude:
1. Build outputs and compiled artifacts
2. Package manager files and lock files
3. Cache and temporary files
4. IDE/editor specific files
5. OS-specific files
6. Log files and debug outputs
7. Test coverage reports
8. Environment-specific configuration files

Focus on common patterns that would reduce noise for AI without excluding important source code, documentation, or configuration files that are essential for understanding the project.`;
	}
}
