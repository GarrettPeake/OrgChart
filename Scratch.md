# OrgChart

## Gemini Cli notes

- Compression: context > 70% -> take most recent 30% and use compression prompt to generate a single context
- Context construction
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
  - Interesting: speakerChecker
  - Shell safety

## Ideas

- Tool that uses fast model to extract key symbols
- Enable MCP servers with MCP SDK so we can use Context7
- Define a browser user agent that has access to Playwright MCP

- Make every tool have a user facing message to explain what it’s doing
- Enable resuming sessions from context logs
- Multi read tool?
- Give delegation a context preloading parameter that allowed a list of globs that would be preloaded in that agents context
- What if there was a central context that all agents shared? There would be a project context and a session context, for example how does the project work vs what are we currently working on? It would be persistently the most recent message for any agent and would contain only important design, tech stack, organization, and architectural details, never any details about or examples of code. Currently pretty much every agent has to invoke a researcher to do the same thing. Use cheap model to ingest every tool call and maintain a "brainmap" that is always shared among the models
- Enable agents to be defined with a list of models that triggers alloying
- Quorum tool that gets the opinion of N models on a certain engineering question (including context) then uses a single model to get the majority opinion (possibly weighted by model intelligence?)
- Give the command runner agent a shell session, undefined to begin with, that they can interact with across turns
- Consider using a change applier such as https://openrouter.ai/meta-llama/llama-3.2-3b-instruct to perfrom https://docs.morphllm.com/quickstart the why on this is here https://web.archive.org/web/20240823050616/https://www.cursor.com/blog/instant-apply

## MVP Checklist

 [ ] Interactivity
    [ ] Security system
        [ ] Command approval with display
        [ ] When agent reaches max turns, ask for approval to continue (renews turns)
        [ ] Configurable auto-allows (project and system level)
    [ ] Help command
    [ ] Config command (opens config editor)
        [ ] Openrouter key setting, stored in system file
        [ ] Allowed tools
        [ ] Standard model set
        [ ] Enable/disable continous context and continuous task context
    [ ] Kill current agent command, force does not allow it to summarize with completion tool first
    [ ] Macros for file selection
    [ ] Enhanced text input
    [ ] Event stream improvements
        [ ] Fenced code blocks
        [ ] Diff view
    [ ] Collapsing agent tree with key binding to show full
    [ ] All tools use updatable events
    [ ] Add CLI params
 [ ] System
    [ ] Enable setting openrouter params at agent level
    [ ] Configuration from defaults + system file + project file
    [ ] Singletons file rather than coupling to config
    [ ] Serialize and deserialize state, load sessions
    [ ] Perfected error handling
    [ ] OpenRouter stream cancellation on pause
    [ ] Enable prompt caching (put continuous context in the system prompt and don't update it)
    [ ] Ensure no provider storage by default
    [ ] Static event stream for older events
    [ ] Tests for everything
    [ ] Define a standard model set and use them everywhere
    [ ] Pausing and resuming works
 [ ] Prompts
    [ ] Simplified agent definitions into classes with composable prompts
    [ ] Improved context passing through better environment understanding
    [ ] Improved tool use through system prompt tool instruction composition
 [ ] Tools
    [ ] Functional edit tool
    [ ] Bash tool interactive (Summarize flag rather than a full agent)
    [ ] Remove file tree tool?
    [ ] Remove project researcher
    [ ] Add context blobs to delegation tool

## Experiment Results

Attempted to make flappy bird, Senior engineer relied on itself too much and ended up spending ~$2 rather than delegating everything. Flappy bird never worked, some crashes likely hurt the prospects. The agents persistently tried to figure out how to test it launching a bunch of researchers
TODO list made the researchers behave significantly better, no infinite loops

Researcher tends to add TODO list tasks but not perform any tool uses, then complete them and keep adding tasks

Sometimes agents expect that one agent can see what was said to or by another agent

Agents will write a file and then immediately read it

Agents for some reason think there's a quote at the end of files?

Pausing agents takes a while, unpausing with a task doesn't work

WHen agents plan, they often write a file and include all of the necessary code in that file for delegation, this is dumb!

Dont' shuffle in cont context update between use and tool results. Don't update at all if no updates

Everything is so slow due to knowledge passing. Each subagent has to generate a response for the parent and that generation takes ages.

## Notes

- Qwen3-coder is super capable and cheap but only 250k (Kimi K-2 is stupid cheap but only 37k context)
- Events need to be updatable, with multiple updates so things like long edits, thinking, or browser use can be displayed in multiple steps
