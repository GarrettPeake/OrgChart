export function cleanText(text: string): string {
	return text
		.split('\n')
		.map(e => e.trimEnd())
		.map(e => e.replaceAll('\t', '  '))
		.join('\n');
}
