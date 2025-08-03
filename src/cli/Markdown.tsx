import React from 'react';
import {parse, setOptions} from 'marked';
import {Text} from 'ink';
import TerminalRenderer, {TerminalRendererOptions} from 'marked-terminal';
import chalk from 'chalk';
import {colors} from './Util.js';

setOptions({
	renderer: new TerminalRenderer({
		code: chalk.hex(colors.textColor),
		blockquote: chalk.hex(colors.subtextColor).italic,
		html: chalk.hex(colors.subtextColor),
		heading: chalk.hex(colors.accentColor),
		firstHeading: chalk.hex(colors.highlightColor),
		hr: chalk.reset,
		listitem: chalk.reset,
		table: chalk.reset,
		paragraph: chalk.reset,
		strong: chalk.bold,
		em: chalk.italic,
		codespan: chalk.hex(colors.accentColor),
		del: chalk.dim.hex(colors.subtextColor).strikethrough,
		link: chalk.blue,
		href: chalk.blue.underline,
		unescape: true,
		emoji: true,
		width: 80,
		showSectionPrefix: true,
		reflowText: false,
		tab: 4,
		tableOptions: {},
	}) as any,
});

export type Props = TerminalRendererOptions & {
	children: string;
};

export default function Markdown({children}: Props) {
	return <Text>{parse(children)}</Text>;
}
