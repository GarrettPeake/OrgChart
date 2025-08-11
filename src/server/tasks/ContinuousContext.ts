import Logger from '@/Logger.js';
import {CompletionInputMessage} from '../utils/provider/OpenRouter.js';
import {getFormattedContext} from '../utils/FileSystemUtils.js';
import {getConfig} from '../utils/Configuration.js';
import fs from 'fs/promises';
import path from 'path';

const systemPrompt = `
You must maintain a single document which accurately, completely, and concisely conveys the entirety of knowledge surrounding a given project.
You will be provided with the current version of the document by the user as well as a summary of actions made since the last update that need to be incorporated and you must output the entirety of an updated version.
The goal of the document is to enable anyone to simply read the document and be immediately prepared to contribute to the project.

INSTRUCTIONS: Provide context based on every file present in the project that is not in the .gitignore. Here is a reference markdown template to use:

---

# Overview

If there are any files in the project which clearly state the intent of the project such as a readme, the description in the package.json or otherwise. You should provide an accurate assessment of that goal here, otherwise this section should summarize the overall functionality of the project without dictating what the purpose is.
To make this distinction clear, if the project code currently enables the processing of CSV files through defined processors, you should state exactly that and would not extrapolate that this project is "Big data pipeline tooling" or anything else.

# Architecture

In this first section, we break the project down into high level components which interacts with each other. Some examples of high level components would be CLI, Web page, Backend, Database cleanup job, background refresher thread, request transform lambda, database

Include decriptions or diagrams of how the different architectural components interact as well as any known deployment characteristics like runtime, cloud provider, etc.. Assign a unique name to each architecture component so it can be referenced later.

# Interfaces

Describe how each architecture component is interacted with (triggers) and how it interacts with it's dependencies (effects). For example, for a high frequency trading algorithm you would cover which markets it interacts with, what libraries and protocols are used to do that, and how often it interacts with those systems.
As another example, for a calculator app you would describe how the interface accepts input (text or buttons) how the user can perform operations, any special operations that can be performed, any hidden interfaces, any menus, etc.
For all of these interactions you should group them by whether they are interactions that affect the system or are system actions that affect dependencies.
You must assign a symbol to each interaction so it can be distinctly referenced later in this document, in the HFT example submitting a trade might be \`submitTrade\` and the calculator might have \`handleInput\` or \`saveSettings\`.
The entrypoint of the program should always be included in the triggers
For architecture components that interact, the corresponding trigger and effect should have the same name, for example if a frontend invokes \`login\` on the backend API, the frontend would have a \`login\` effect and the backend a \`login\` trigger. This makes it clear how the architecture components interact.
Note: If an effect does not have a corresponding trigger on another component or vice versa, it will be assumed that it effects or is triggered by something external to the project.


An example of this section for the example trading engine component is as follows:

## Trading Engine

This trading algorithm is a long running process which is automatically enabled during market hours to make trades on the Fidelity trading platform based on the decisions of an internal algorithm executed on market data retrieved from the trading platform.

### Triggers

 * \`launch\` kicks off the program, initializing the clock, trading platform credentials, and 
 * \`systemd\` a clock callback that enables the system during market and pre-market hours

### Effects

 * \`getMarketData\` retrieves current market data from the Fidelity trading platform
 * \`submitTrade\` submits a trade deemed profitable by the algorithm to the Fidelity trading platform and does not await the result

# Structure

Include the entire fileTree that was provided to you here

Use nested subheaders to re-create the repository structure. You should include key symbols and type definitions but never code snippets that just contain logic as all logic should be analyzed and summarized. Example section:

<filetree>

## ./

Usually the configuration files are at the top level of the project along with the readme, etc. For files whose purpose is to provide context in the same way as this template, incorporate any relevant information rather than summarizing the file, this will help to make this template even more useful.
For configuration files, summarize the purpose of the file and important configuration options that affect code without providing code snippets.

### src/

#### <filename>.<extension>

Describe at a high level what functionality is contained in this file and how that functionality is accessible using the key symbols present in the file that may be used in other files (like exported or public members)
When including symbol information use the actual definition, an example might be:

Key symbols:
 * \`getSnailVelocity(snailId?: string) => number\` to get snail velocity in m/s, returns 0 if snailId is not present or null (If it contains typescript code)
 * \`inline fun setGermanCapital(newCapital: String): Float\` to set the capital of Germany (If it contains Kotlin code)

#### components/

... etc.

# Logical Flow

This section should cover the internal mechanisms of trigger => effect logic for each architecture component:
    * Refer to things using the interaction and symbol names as well as the file name like '[\`getSnailVelocity()\`](BugMeasurements.py)' or '[\`## Lost and Found\`](SCHOOL.md)'
    * Branching logic caused by different inputs should be covered
    * Ensure that every piece of logical wiring is represented. Do not hesitate to include a substantial amount of information in this section
    * Provide a logical hierarchy of components. You should provide this as a directed graph where the highest-order components are at the top
    * Take creative freedom and eagerness to include anything else that you believe is relevant to understanding the project as this should be a complete mental map of the project

An example for the Trading Engine would be:

## Trading Engine

\`launch\` starts [\`server\`](Server.rs) which and waits for \`systemd\` to schedule a trading task. Upon scheduling a new [\`TradingAlgorithm\`](Algorithm.rs) is created and fed data from persistently polling \`getMarketData\`. Whenever the algorithm outputs a trade signal, \`submitTrade\` is used.
The algorithm itself makes determinations based on a combination MACD and 60 day moving average through a custom heuristic function. When the heuristic passes the configured threshold a trade signal is emitted.

# Development

Useful CLI commands, the different technologies and dependencies used, any scripts that already exist, how the project is tested, etc.

## Style

A brief guide on how to imitate the current style of the project, things like class naming, variable naming, test naming, whether it's functional, stream-based, object oriented, uses callbacks, etc.
`;

/**
 * Retrieve the current context, this will block if there are updates being made
 */
export const createInitialContent = async () => {
	const context: CompletionInputMessage[] = [
		{
			role: 'system',
			content: systemPrompt,
		},
		{
			role: 'user',
			content: await getFormattedContext(),
		},
	];
	getConfig()
		.llmProvider.chatCompletion(
			{
				model: 'openai/gpt-oss-120b',
				messages: context,
				tool_choice: 'none',
				temperature: 0.2,
				stream: false,
				provider: {
					sort: 'throughput',
				},
			},
			[],
		)
		.then(async response => {
			const choice = response?.choices?.[0];
			const message = choice?.message;
			if (message) {
				await fs.writeFile(
					getConfig().projectContextFile,
					message.content!,
					'utf8',
				);
			} else {
				Logger.info(
					`No message received from LLM for continuous context: ${JSON.stringify(
						response,
					)}`,
				);
			}
		});
    await fs.writeFile(
		path.join(getConfig().orgChartDir, 'FULL_CONTEXT.md'),
		await getFormattedContext(),
		'utf8',
	);
};

const updateContext = () => {
	return '';
};
