export function cleanText(text: string): string {
	return text
		.split('\n')
		.map(e => e.trimEnd())
		.map(e => e.replaceAll('\t', '  '))
		.join('\n');
}

/**
 *
 * @param file_name The name of the file which includes the file extension
 */
export function filetypeToMDType(file_name: string): string {
	switch (file_name.split('.')[1]) {
		case undefined:
			return '';
		case undefined:
			return '';
		default:
			return '';
	}
}
