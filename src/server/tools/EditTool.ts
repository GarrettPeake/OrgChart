import {DisplayContentType, OrgchartEvent} from '../IOTypes.js';
import {ToolDefinition} from './index.js';
import {TaskAgent} from '../tasks/TaskAgent.js';
import fs from 'fs/promises';
import {createPatch} from 'diff';

const descriptionForAgent = `Request to make multiple edits to a file at the specified path. This tool modifies existing content by finding exact text matches and replacing them, rather than overwriting the entire file. You can make multiple edits in a single operation for efficiency.

## Core Principles:
- Each edit specifies 'old_content' that must match EXACTLY one place in the text and will be fully replaced with 'new_content'
- The 'old_content' must be unique in the file - if there are multiple matches, the edit will fail
- Always read the file first to ensure you have the exact content to match

## Best Practices for Choosing 'old_content':

**1. Include Sufficient Context (Recommended)**
- Use 2-4 lines of context around your target to ensure uniqueness
- Include indentation, whitespace, and surrounding code exactly as it appears
- Example: Instead of just "const x = 1", use "function test() {\n  const x = 1;\n  return x;"

**2. For Function Changes**
- Include the complete function signature and opening brace
- For small functions, include the entire function
- For large functions, use the signature plus a few unique lines

**3. For Import/Export Changes**
- Include the full import/export statement
- Consider including neighboring imports if the target isn't unique

**4. For Variable/Property Changes**
- Include enough surrounding context to make the line unique
- Include the assignment or declaration context

**5. For Multi-line Changes**
- Include complete logical blocks (if statements, loops, etc.)
- Preserve exact indentation and formatting

## Common Strategies:

**Strategy 1: Single Line with Context**
Good for changing one line when you have unique surrounding context.

**Strategy 2: Complete Function Replacement**
Best for major function rewrites - include entire function from signature to closing brace.

**Strategy 3: Targeted Block Changes**
For changing specific code blocks - include the block boundaries (opening/closing braces, etc.).

**Strategy 4: Multiple Small Edits**
Break large changes into smaller, independent edits that don't overlap.

## Error Prevention:

**❌ Avoid These Mistakes:**
- Using partial lines that appear multiple times in the file
- Forgetting to include exact whitespace and indentation
- Escaping quotes or special characters (use them literally)
- Making overlapping edits that conflict with each other

**✅ Do This Instead:**
- Copy-paste the exact text from the file you want to replace
- Test uniqueness by searching for your 'old_content' in the file
- Use complete logical units (full lines, complete statements)
- Verify indentation matches exactly

## Examples:

1. **Function Name Change (with context for uniqueness):**
{
  "file_path": "src/utils.ts",
  "edits": [
    {
      "old_content": "export function calculatePrice(items: Item[]): number {\n  let total = 0;",
      "new_content": "export function calculateTotalPrice(items: Item[]): number {\n  let total = 0;"
    }
  ]
}

2. **Complete Function Replacement:**
{
  "file_path": "src/auth.ts",
  "edits": [
    {
      "old_content": "async function validateUser(token: string): Promise<User | null> {\n  try {\n    const decoded = jwt.verify(token, SECRET);\n    return await User.findById(decoded.id);\n  } catch (error) {\n    return null;\n  }\n}",
      "new_content": "async function validateUser(token: string): Promise<User | null> {\n  if (!token) return null;\n  \n  try {\n    const decoded = jwt.verify(token, process.env.JWT_SECRET!);\n    const user = await User.findById(decoded.id);\n    return user?.isActive ? user : null;\n  } catch (error) {\n    console.error('Token validation failed:', error);\n    return null;\n  }\n}"
    }
  ]
}

3. **Multiple Independent Changes:**
{
  "file_path": "src/config.ts",
  "edits": [
    {
      "old_content": "const API_URL = 'http://localhost:3000';",
      "new_content": "const API_URL = process.env.API_URL || 'http://localhost:3000';"
    },
    {
      "old_content": "const TIMEOUT = 5000;",
      "new_content": "const TIMEOUT = 10000;"
    }
  ]
}

4. **Adding Content (insert after specific line):**
{
  "file_path": "src/types.ts",
  "edits": [
    {
      "old_content": "interface User {\n  id: string;\n  name: string;\n}",
      "new_content": "interface User {\n  id: string;\n  name: string;\n  email: string;\n  createdAt: Date;\n}"
    }
  ]
}

5. **Removing Content:**
{
  "file_path": "src/debug.ts",
  "edits": [
    {
      "old_content": "  // Debug logging\n  console.log('Processing item:', item);\n  console.log('Current state:', state);\n",
      "new_content": ""
    }
  ]
}

## File Path Notes:
- The file_path parameter must be a relative path to the current working directory
- Always verify the file exists by reading it first

## Performance Tips:
- Make multiple edits in a single tool call when possible
- Group related changes together`;

interface Edit {
	old_content: string;
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
						old_content: {
							type: 'string',
							description:
								'The exact content to be replaced. Must match exactly one location in the file (use 1-3 full lines for unique matching)',
						},
						new_content: {
							type: 'string',
							description: 'The new content to replace the old_content with',
						},
					},
					required: ['old_content', 'new_content'],
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
		const eventId = crypto.randomUUID();
		writeEvent({
			title: args.reasoning,
			id: eventId,
			content: [
				{
					type: DisplayContentType.TEXT,
					content: `Edit(${args.file_path}) -> Applying ${args.edits.length} edit(s) to ${args.file_path}`,
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
				const contentIndex = modifiedContent.indexOf(edit.old_content);

				if (contentIndex === -1) {
					failures.push(
						`Edit ${i}: Could not find 'old_content' string: \n\`\`\`\n${edit.old_content}\n\`\`\`\n`,
					);
					return;
				}

				// Check if there are multiple matches for the old_content string
				const secondContentIndex = modifiedContent.indexOf(
					edit.old_content,
					contentIndex + 1,
				);
				if (secondContentIndex !== -1) {
					failures.push(
						`Edit ${i}: 'old_content' string \n\`\`\`\n${edit.old_content}\n\`\`\`\n is not unique - found multiple matches`,
					);
					return;
				}
			});

			// If there are any failures, return error without making changes
			if (failures.length > 0) {
				writeEvent({
					title: args.reasoning,
					id: eventId,
					content: [
						{
							type: DisplayContentType.TEXT,
							content: `Edit(${args.file_path}) -> Failed to edit ${
								args.file_path
							}:\n${failures.join('\n')}`,
						},
					],
				});
				return `Failed to apply edits, you should re-read the file to ensure your 'old_content' strings are accurate and unique:\n${failures.join(
					'\n',
				)}`;
			}

			// Apply all edits (in reverse order to maintain correct indices)
			const sortedEdits = args.edits
				.map((edit, index) => ({...edit, originalIndex: index}))
				.sort((a, b) => {
					const aContentIndex = modifiedContent.indexOf(a.old_content);
					const bContentIndex = modifiedContent.indexOf(b.old_content);
					return bContentIndex - aContentIndex; // Reverse order
				});

			for (const edit of sortedEdits) {
				const contentIndex = modifiedContent.indexOf(edit.old_content);
				const endIndex = contentIndex + edit.old_content.length;

				modifiedContent =
					modifiedContent.substring(0, contentIndex) +
					edit.new_content +
					modifiedContent.substring(endIndex);
			}

			// Write the modified content back to the file
			await fs.writeFile(args.file_path, modifiedContent, 'utf8');

			if (originalContent === modifiedContent) {
				return `No changes were made to ${args.file_path}.`;
			} else {
				return createPatch(args.file_path, originalContent, modifiedContent);
			}
		} catch (error) {
			writeEvent({
				title: args.reasoning,
				id: eventId,
				content: [
					{
						type: DisplayContentType.TEXT,
						content: `Edit(${args.file_path}) -> Failed to edit ${args.file_path}:\n${error}`,
					},
				],
			});
			throw error;
		}
	},
};
