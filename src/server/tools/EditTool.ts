import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';
import fs from 'fs/promises';

const descriptionForAgent = `Request to make multiple edits to a file at the specified path. This tool modifies existing content rather than overwriting the entire file. You can make multiple edits in a single operation for efficiency.

Usage:
- The file_path parameter must be a relative path to the current working directory
- Each edit specifies a 'from' and 'to' search string that defines the range of content to replace (inclusive)
- The content between 'from' and 'to' will be replaced with 'new_content'
- Use 1-2 full lines of text for 'from' and 'to' to ensure unique matches
- Make multiple edits at once when possible for better performance
- Make multiple small edits if smaller modifications are required many lines apart
- Make a single or a few larger edits if rewrites of entire functions or blocks of code are necessary

Examples:
1. To change a function name and its return statement in a TypeScript file:
{
  "file_path": "src/utils.ts",
  "edits": [
    {
      "from": "function calculatePrice(items: Item[]): number {",
      "to": "function calculatePrice(items: Item[]): number {",
      "new_content": "function calculateTotalPrice(items: Item[]): number {"
    },
    {
      "from": "  return total;",
      "to": "}",
      "new_content": "  return total;\n}"
    }
  ]
}
  
2. To rewrite a full function in a TypeScript file:
{
  "file_path": "src/bank.ts",
  "edits": [
    {
      "from": "function getAccounts(customerId: string): CustomerAccount[] {",
      "to": "  const savingsAccounts = client.getSavings(customerId);\n  return accounts[];",
      "new_content": "function getAccounts(customer: Customer): CustomerAccounts {\n  return client.getAccounts(customer.id) as CustomerAccounts;"
    }
  ]
}
  
3. To remove the content from a line and delete a line from a Python file:
{
  "file_path": "src/utils/math.ts",
  "edits": [
    {
      "from": "t_max = np.where(t > 10)",
      "to": "t_max = np.where(t > 10)",
      "new_content": ""
    },
    {
      "from": "quaternion_ball = np.ndarray(a, z, y, p)\n",
      "to": "quaternion_ball = np.ndarray(a, z, y, p)\n",
      "new_content": ""
    }
  ]
}`;

interface Edit {
	from: string;
	to: string;
	new_content: string;
}

export const editToolDefinition: ToolDefinition = {
	name: 'Edit',
	descriptionForAgent: descriptionForAgent,
	inputSchema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description:
					'A brief explanation (1-2 sentences) of why you need to edit this file and what changes you are making.',
			},
			file_path: {
				type: 'string',
				description:
					'The path of the file to edit (relative to the current working directory)',
			},
			edits: {
				type: 'array',
				description: 'Array of edits to apply to the file',
				items: {
					type: 'object',
					properties: {
						from: {
							type: 'string',
							description:
								'The starting search string which is unique across the entire file (use 1-2 full lines for unique matching)',
						},
						to: {
							type: 'string',
							description:
								'The ending search string which is unique across the entire file (use 1-2 full lines for unique matching)',
						},
						new_content: {
							type: 'string',
							description:
								'The new content to replace the section between from and to (inclusive)',
						},
					},
					required: ['from', 'to', 'new_content'],
				},
				minItems: 1,
			},
		},
		required: ['reasoning', 'file_path', 'edits'],
	},
	enact: async (
		args: {
			reasoning: string;
			file_path: string;
			edits: Edit[];
		},
		invoker: TaskAgent,
		writeEvent: (event: OrgchartEvent) => void,
	): Promise<string> => {
		writeEvent({
			title: `Edit(${args.file_path})`,
			id: crypto.randomUUID(),
			content: [
				{
					type: DisplayContentType.TEXT,
					content: args.reasoning,
				},
				{
					type: DisplayContentType.TEXT,
					content: `Applying ${args.edits.length} edit(s) to ${args.file_path}`,
				},
			],
		});

		try {
			// Check if file exists
			try {
				await fs.access(args.file_path);
			} catch {
				throw new Error(`File ${args.file_path} does not exist`);
			}

			// Read the current file content
			const originalContent = await fs.readFile(args.file_path, 'utf8');
			let modifiedContent = originalContent;
			const failures: string[] = [];

			// Validate all edits before applying any
			args.edits.forEach((edit, i) => {
				const fromIndex = modifiedContent.indexOf(edit.from);

				if (fromIndex === -1) {
					failures.push(
						`Edit ${i}: Could not find 'from' string: "${edit.from}"`,
					);
					return;
				}

				const toIndex = modifiedContent.indexOf(edit.to);

				if (toIndex === -1 || toIndex < fromIndex) {
					failures.push(
						`Edit ${i}: Could not find 'to' string: "${edit.to}" at or after 'from' string: "${edit.from}"`,
					);
					return;
				}

				// Check if there are multiple matches for the from string
				const secondFromIndex = modifiedContent.indexOf(
					edit.from,
					fromIndex + 1,
				);
				if (secondFromIndex !== -1) {
					failures.push(
						`Edit ${i}: 'from' string "${edit.from}" is not unique - found multiple matches`,
					);
					return;
				}

				// Check if there are multiple matches for the from string
				const secondToIndex = modifiedContent.indexOf(edit.to, toIndex + 1);
				if (secondToIndex !== -1) {
					failures.push(
						`Edit ${i + 1}: 'to' string "${
							edit.to
						}" is not unique - found multiple matches`,
					);
					return;
				}
			});

			// If there are any failures, return error without making changes
			if (failures.length > 0) {
				throw new Error(
					`Failed to apply edits, you should re-read the file to ensure your 'to' and 'from' strings are accurate and unique:\n${failures.join(
						'\n',
					)}`,
				);
			}

			// Apply all edits (in reverse order to maintain correct indices)
			const sortedEdits = args.edits
				.map((edit, index) => ({...edit, originalIndex: index}))
				.sort((a, b) => {
					const aFromIndex = modifiedContent.indexOf(a.from);
					const bFromIndex = modifiedContent.indexOf(b.from);
					return bFromIndex - aFromIndex; // Reverse order
				});

			for (const edit of sortedEdits) {
				// Use N-1 characters to identify the index of the change, the Nth character is often wrong if at the end of a file
				const fromIndex = modifiedContent.indexOf(
					edit.from.slice(0, edit.from.length - 1),
				);
				const toIndex = modifiedContent.indexOf(
					edit.to.slice(0, edit.to.length - 1),
				);
				const endIndex = toIndex + edit.to.length;

				modifiedContent =
					modifiedContent.substring(0, fromIndex) +
					edit.new_content +
					modifiedContent.substring(endIndex);
			}

			// Write the modified content back to the file
			await fs.writeFile(args.file_path, modifiedContent, 'utf8');

			const charactersChanged = Math.abs(
				modifiedContent.length - originalContent.length,
			);
			return `Successfully applied ${args.edits.length} edit(s) to ${args.file_path}. Content changed by ${charactersChanged} characters.`;
		} catch (error) {
			throw new Error(`Failed to edit file ${args.file_path}: ${error}`);
		}
	},
};
