import {ToolDefinition} from './index.js';
import Logger from '../../Logger.js';
import {StreamEvent} from '../../cli/EventStream.js';
// @ts-ignore
import pdf from 'pdf-parse/lib/pdf-parse';
import mammoth from 'mammoth';

const descriptionForAgent = `Read the contents of a file at the specified path. Use this when you need to examine the contents of an existing file you do not know the contents of, for example to analyze code, review text files, or extract information from configuration files. Automatically extracts raw text from PDF and DOCX files. May not be suitable for other types of binary files, as it returns the raw content as a string.`;

export const readToolDefinition: ToolDefinition = {
	name: 'Read',
	descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			file_path: {
				type: 'string',
				description: `The path of the file to read (relative to the current working directory)`,
			},
			justification: {
				type: 'string',
				description: `A short justification describing why you are reading this file`,
			},
		},
		required: ['file_path', 'justification'],
	},
	enact: async (args: {file_path: string}): Promise<string> =>
		await readFile(args.file_path),
	formatEvent: async (args: {file_path: string}): Promise<StreamEvent> => ({
		title: `Read(${args.file_path})`,
		content: '',
	}),
};

const readFile = async (file_path: string): Promise<string> => {
	const fs = await import('fs/promises');
	const path = await import('path');

	try {
		const filePath = path.resolve(file_path);
		const fileExtension = path.extname(filePath).toLowerCase();

		if (fileExtension === '.pdf') {
			const buffer = await fs.readFile(filePath);
			const data = await pdf(buffer);
			return data.text;
		} else if (fileExtension === '.docx') {
			const buffer = await fs.readFile(filePath);
			const result = await mammoth.extractRawText({buffer});
			return result.value;
		} else {
			const content = await fs.readFile(filePath, 'utf-8');
			return content;
		}
	} catch (error) {
		Logger.error(error, `Failed to read file: ${file_path}`);
		if (
			error instanceof Error &&
			error.message.includes('no such file or directory')
		) {
			Logger.error(error, 'Failed to read file');
			return `No such file or directory: ${file_path}`;
		}
		throw new Error(
			`Failed to read file ${file_path}: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
};
