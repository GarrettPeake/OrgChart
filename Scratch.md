# OrgChart

## Gemini Cli notes

- Compression: context > 70% -> take most recent 30% and use compression prompt to generate a single context
- Context constructio
- Function scheduler
  - Each tool function has a status like waiting for approval
  - Main loop just adds to the function scheduler then waits on the function scheduler
  - Includes tool call ms timing for display
  - Allows for interim outcomes
  - Having it be slightly async allows requesting permission for a tool while all other tools in the request are executed
- Chat history curation removes invalid responses from model
- Retry with backoff on API errors
- Content streaming
- See Core prompts
- Lots of useful utils:
  - Tools
  - getFolderStructure
  - Interesting: speakerChecker
  - Shell safety

## Ideas

- Tool that uses fast model to extract key symbols
- Enable MCP servers with MCP SDK so we can use Context7
- As you type your prompt, have the TPM model with only the system prompt say how it’s going to delegate the work. This delegation gets passed in the prompt to the real TPM agent
- Define a browser user agent that has access to Playwright MCP
- Define a command runner agent that accepts a bash command, determines if it's safe, then runs it and summarizes the results

- Make everything was a TODO list? We make the event stream full width and the agent tree full width and allow tab to toggle between them. Agent tree would then look like:
  Technical Product Manager - <Main task>

* Subtask 1 [x]
* Senior Engineer - Subtask 2 [ ]
  - Subtask 1 [x]
  - Junior Engineer - Subtask 2 [ ]
* Subtask 3 [ ]
* Subtask 4 [ ]

- Make every tool have a user facing message to explain what it’s doing
- Handle LLM not using tools, API errors, etc gracefully
- Enable resuming sessions from context logs
- Multi read tool?
- Give delegation a context preloading parameter that allowed a list of globs that would be preloaded in that agents context
- What if there was a central context that all agents shared? There would be a project context and a session context, for example how does the project work vs what are we currently working on? It would be persistently the most recent message for any agent and would contain only important design, tech stack, organization, and architectural details, never any details about or examples of code. Currently pretty much every agent has to invoke a researcher to do the same thing
- Enable agents to be defined with a list of models that triggers alloying
- Quorum tool that gets the opinion of N models on a certain engineering question (including context) then uses a single model to get the majority opinion (possibly weighted by model intelligence?)

## Experiment Results

Attempted to make flappy bird, Senior engineer relied on itself too much and ended up spending ~$2 rather than delegating everything. Flappy bird never worked, some crashes likely hurt the prospects. The agents persistently tried to figure out how to test it launching a bunch of researchers
TODO list made the researchers behave significantly better, no infinite loops

Researcher tends to add TODO list tasks but not perform any tool uses, then complete them and keep adding tasks

Sometimes agents expect that one agent can see what was said to or by another agent

## Notes

- Qwen3-coder is super capable and cheap but only 250k (Kimi K-2 is stupid cheap but only 37k context)
- Events need to be updatable, with multiple updates so things like long edits, thinking, or browser use can be displayed in multiple steps
