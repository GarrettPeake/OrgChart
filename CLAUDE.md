# OrgChart Project Documentation

_Version 1.0 – generated 2025‑08‑15_

---

## Overview

The repository implements **OrgChart**, a locally‑run, terminal‑based multi‑agent orchestration framework written in TypeScript.

- The **CLI** (`src/App.tsx`) launches an Ink UI that lets a user select a top‑level agent, type a task, and watch a live event stream.
- **Agents** are defined in `src/server/agents/Agents.ts` and concrete implementations (e.g., `TechnicalProductManager`, `SeniorSoftwareEngineer`, `JuniorDesigner`, `CodeReviewer`, `CommandRunner`). Each agent carries a model, temperature, system prompt, and a toolbox.
- A **TaskAgent** state‑machine (`src/server/tasks/TaskAgent.ts`) executes a user‑provided task by iteratively:
  1. Sending the current context to an LLM (via `LLMProvider`).
  2. Receiving tool calls, creating pending tool blocks, executing the tools, and updating the context.
  3. Recursively delegating work to child agents via the `delegate_work` tool.
- **ContinuousContextManager** (`src/server/workflows/ContinuousContext.ts`) watches the project files, records mutations, and keeps a single “project‑knowledge” document up‑to‑date by prompting the LLM whenever changes occur.
- **Tools** (`src/server/tools/*`) are pure functions that perform actions such as reading/writing files, editing files, executing Bash commands, searching with grep, building a file‑tree, asking the user a question, updating the TODO list, and signalling task completion.

The code does **not** expose any HTTP API, database, or external services other than the LLM provider (OpenRouter) and the local file system.

---

## Architecture

| Component                                                                  | Description                                                                                                                                                                      | Primary Interaction                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **CLI Application** (`src/App.tsx` + UI components)                        | Ink‑based terminal UI that shows the agent tree, event stream, and a command panel.                                                                                              | Sends user commands to **PromiseServer**; receives events from the server to render.          |
| **PromiseServer** (`src/server/PromiseServer.ts`)                          | In‑process “server” that owns the root **TaskAgent**, a **ContinuousContextManager**, and a **CommandRegistry**. It polls the UI, forwards commands, and emits `OrgchartEvent`s. | Receives commands from CLI; drives the root **TaskAgent**; triggers context updates.          |
| **TaskAgent** (`src/server/tasks/TaskAgent.ts`)                            | Finite‑state machine that manages a single agent’s lifecycle, its conversation with the user, tool execution, child delegation, and cost/usage tracking.                         | Calls **LLMProvider**; invokes tools; creates child **TaskAgent**s; updates **AgentContext**. |
| **AgentContext** (`src/server/tasks/AgentContext.ts`)                      | Structured conversation buffer split into typed blocks (SYSTEM, USER, ASSISTANT, TOOL, CONTEXT, PARENT). Provides token‑usage stats and a debug summary.                         | Consumed by **TaskAgent** to build LLM messages; persisted by **ContextLogger**.              |
| **ContinuousContextManager** (`src/server/workflows/ContinuousContext.ts`) | Watches the repository, records file mutations, and periodically asks the LLM to rewrite the single “project knowledge” document.                                                | Emits updated context to **TaskAgent** via `AgentContext.addContextBlock`.                    |
| **Tools** (`src/server/tools/*`)                                           | Pure functions (e.g., `Read`, `Write`, `Edit`, `Bash`, `Grep`, `FileTree`, `AskQuestion`, `DelegateWork`, `UpdateTodoList`, `AttemptCompletion`).                                | Called by the LLM through the tool‑calling API; each tool writes an `OrgchartEvent`.          |
| **Agents** (`src/server/agents/*`)                                         | Static definitions (model, system prompt, toolbox) that the LLM sees as its “role”.                                                                                              | Provide system prompts and toolsets to **TaskAgent**.                                         |
| **Configuration** (`src/server/utils/Configuration.ts`)                    | Lazy‑loaded singleton that holds paths, default agent, ignore patterns, max iterations, and the **LLMProvider** instance.                                                        | Consumed by every module that needs runtime settings.                                         |
| **LLMProvider** (`src/server/utils/provider/LLMProvider.ts`)               | Thin wrapper around OpenRouter’s chat‑completion endpoint; adds retry logic and cost tracking.                                                                                   | Used by **TaskAgent** and **ContinuousContextManager**.                                       |

All components run in a single Node.js process; communication is via in‑memory method calls and event objects (`OrgchartEvent`).

---

## Interfaces

### CLI Application (`src/App.tsx` and UI components)

| Symbol                    | Type                                         | Description                                                                                 |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **`main` trigger**        | program entry (`node ./dist/src/App.js`)     | Parses CLI args with **meow**, creates a `Logger` entry, and calls `render(<Interface />)`. |
| **`onUserCommand`**       | `CommandPanel` → `PromiseServer.sendCommand` | When the user presses **Enter**, the typed command (or `/command`) is sent to the server.   |
| **`onKeyEscape`**         | `useInput` handler                           | Pauses the running agent (`PromiseServer.pause()`).                                         |
| **`renderAgentTree`**     | `AgentTree` component                        | Reads `PromiseServer.getAgentGraph()` and renders a tree of `RunningAgentInfo`.             |
| **`renderEventStream`**   | `EventStream` component                      | Reads `PromiseServer.getEvents()` and renders markdown‑formatted events.                    |
| **Effect – `render`**     | Ink `render` call                            | Draws the UI to the terminal.                                                               |
| **Effect – `writeEvent`** | `PromiseServer.upsertEvent`                  | UI components push new `OrgchartEvent`s (e.g., tool usage, command execution).              |

### Server Core (`src/server/PromiseServer.ts`)

| Symbol                            | Type                                                 | Description                                                                                                                             |
| --------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **`startAgent` trigger**          | first user command (non‑command)                     | Creates the root **TaskAgent** with the default or overridden agent ID.                                                                 |
| **`sendCommand` trigger**         | `PromiseServer.sendCommand(command: string)`         | If the command starts with `/` → `CommandRegistry.executeCommand`; otherwise forwards to the active **TaskAgent** via its conversation. |
| **`stepInterval` effect**         | `setInterval(() => taskAgent.step(), 250)`           | Drives the state machine of the root agent (and its children).                                                                          |
| **`upsertEvent` effect**          | `events.push` / replace by ID                        | Stores or updates an `OrgchartEvent` for UI consumption.                                                                                |
| **`pause` effect**                | `TaskAgent.pause()`                                  | Sets the active agent’s status to `PAUSED`.                                                                                             |
| **`triggerContextUpdate` effect** | `ContinuousContextManager.updateContext()`           | Called by a **TaskAgent** after `delegate_work` or `attempt_completion`.                                                                |
| **`getAgentTypes` effect**        | Returns static list of agents (`StaticAgentInfo[]`). | Used by the start‑menu UI.                                                                                                              |

### Command Registry (`src/server/commands/CommandRegistry.ts`)

| Symbol                            | Type                                                                                     | Description              |
| --------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| **`isCommand` trigger**           | `input.trim().startsWith('/')`                                                           | Detects a slash command. |
| **`executeCommand` effect**       | Looks up command in `Map<string, BaseCommand>` and runs `command.execute(args, server)`. |
| **`getAvailableCommands` effect** | Returns list of `{name, description}` for UI auto‑completion.                            |

### Continuous Context Manager (`src/server/workflows/ContinuousContext.ts`)

| Symbol                           | Type                                                                                                                        | Description                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------- | ---------------------------------------- |
| **`initialize` trigger**         | `manager.initialize()` (called by `PromiseServer` ctor)                                                                     | Builds the initial context document and starts file watching.   |
| **`fileEvent` trigger**          | Callback from `startFileWatching` for `create                                                                               | update                                                          | delete`. | Records mutation in `fileMutations` map. |
| **`updateContext` effect**       | Calls `LLMProvider.chatCompletion` with the previous context + mutation summary, writes `PROJECT.md` and `FULL_CONTEXT.md`. |
| **`refreshContextBlock` effect** | `AgentContext.refreshContextBlock()`                                                                                        | Replaces the old CONTEXT block with the latest project context. |
| **`destroy` effect**             | Calls the unsubscribe function from the file watcher.                                                                       |

### Tools (`src/server/tools/*`)

All tools share the signature

```ts
enact: (
	args: any,
	invoker: TaskAgent,
	writeEvent: (e: OrgchartEvent) => void,
	toolCallId?: string,
) => Promise<string>;
```

| Tool                                               | Trigger (LLM tool call)                                     | Effect (what the tool does)                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Read** (`ReadFileTool.ts`)                       | `Read` with `{file_path, justification}`                    | Emits `Read(<path>)` event, returns file contents (plain, PDF, or DOCX).                                                       |
| **Write** (`WriteTool.ts`)                         | `Write` with `{file_path, content}`                         | Emits `Write(<path>)` event, creates directories, writes file (overwrites).                                                    |
| **Edit** (`EditTool.ts`)                           | `Edit` with `{file_path, edits[]}`                          | Emits `Edit(<path>)` event, validates unique `from/to` strings, applies edits atomically, writes file.                         |
| **Bash** (`BashTool.ts`)                           | `Bash` with `{command, followup_input?, requires_approval}` | Emits `Bash(<command>)` event, runs command via `spawnSync` (safety checks), returns stdout.                                   |
| **Grep** (`GrepTool.ts`)                           | `Grep` with `{pattern, path, include}`                      | Emits `Grep(<pattern>)` event, searches files with `glob` + regex, returns matching lines.                                     |
| **FileTree** (`FileTreeTool.ts`)                   | `FileTree` with `{path}`                                    | Emits `FileTree(<path>)` event, returns the output of `getFileTree`.                                                           |
| **AskQuestion** (`AskQuestionTool.ts`)             | `AskQuestion` with `{question}`                             | Emits `Question from Agent` event, returns static `"Answer"` (placeholder).                                                    |
| **DelegateWork** (`DelegateWorkTool.ts`)           | `DelegateWork` with `{task, agentId}`                       | Emits `DelegateWork(<agent>)` event, creates a child `TaskAgent`, puts parent in `WAITING`.                                    |
| **UpdateTodoList** (`UpdateTodoListTool.ts`)       | `UpdateTodoList` with `{todo_items}`                        | Emits `UpdateTodoList` event, updates the invoker’s `todoList`.                                                                |
| **AttemptCompletion** (`AttemptCompletionTool.ts`) | `AttemptCompletion` with `{status}`                         | Emits a “completing task” event, runs a sub‑completion LLM call to produce a final human‑readable result, returns that result. |

---

## Structure

Below is the repository tree **excluding** paths listed in `.gitignore` (`node_modules/`, `dist/`, `coverage/`, `.env*`, `.orgchart/`, etc.).

```
/
├─ .aiignore                     # AI‑generated ignore patterns (generated by /commands/AIIgnoreCommand)
├─ .claude/
│   └─ settings.local.json       # Permissions for the Claude tool (not used by runtime)
├─ .gitignore                    # Ignored files for git
├─ CLAUDE.md                     # High‑level design description (human‑written)
├─ LICENSE                       # Apache‑2.0 license
├─ Scratch.md                    # Development notes, ideas, and MVP checklist
├─ package.json                  # NPM manifest, scripts, dependencies
├─ tsconfig.json                 # TypeScript compiler options (extends @sindresorhus/tsconfig)
├─ vite.config.ts                # Vite config (React plugin, tsconfig‑paths)
├─ vitest.config.ts              # Vitest config (coverage, reporters)
├─ src/
│   ├─ App.tsx                   # CLI entry point; sets up Logger, parses args, renders <Interface />
│   ├─ Logger.ts                 # pino logger + ContextLogger helper for per‑agent context files
│   ├─ cli/
│   │   ├─ AgentTree.tsx         # Renders the hierarchical agent tree UI
│   │   ├─ CommandPanel.tsx      # Text‑input box with command auto‑completion
│   │   ├─ EventStream.tsx       # Renders markdown events in a scrollable list
│   │   ├─ Interface.tsx         # Main UI layout: header, event stream, agent tree, command panel
│   │   ├─ Markdown.tsx          # Wrapper around `marked-terminal` for markdown rendering
│   │   ├─ StartMenu.tsx         # Initial screen to pick an agent and type a task
│   │   └─ Util.ts               # Color palette and terminal‑size hook
│   ├─ server/
│   │   ├─ IOTypes.ts            # Shared enums & types (AgentStatus, OrgchartEvent, etc.)
│   │   ├─ PromiseServer.ts       # In‑process server that owns the root TaskAgent
│   │   ├─ agents/
│   │   │   ├─ Agents.ts          # Registry of all agents + helper `toStaticAgentInfo`
│   │   │   ├─ Designer/
│   │   │   │   ├─ AssociateDesigner.ts
│   │   │   │   ├─ JuniorDesigner.ts
│   │   │   │   └─ SeniorDesigner.ts
│   │   │   ├─ L0/
│   │   │   │   ├─ CodeReviewer.ts
│   │   │   │   ├─ CommandRunner.ts
│   │   │   │   └─ ProjectResearcher.ts
│   │   │   ├─ Management/
│   │   │   │   └─ TechnicalProductManager.ts
│   │   │   └─ SWE/
│   │   │       ├─ AssociateSoftwareEngineer.ts
│   │   │       ├─ JuniorSoftwareEngineer.ts
│   │   │       └─ SeniorSoftwareEngineer.ts
│   │   ├─ commands/
│   │   │   ├─ AIIgnoreCommand.ts
│   │   │   ├─ BaseCommand.ts
│   │   │   ├─ ChangeAgentCommand.ts
│   │   │   └─ index.ts
│   │   ├─ tasks/
│   │   │   ├─ AgentContext.ts
│   │   │   ├─ Conversation.ts
│   │   │   └─ TaskAgent.ts
│   │   ├─ tools/
│   │   │   ├─ AskQuestionTool.ts
│   │   │   ├─ AttemptCompletionTool.ts
│   │   │   ├─ BashTool.ts
│   │   │   ├─ DelegateWorkTool.ts
│   │   │   ├─ EditTool.ts
│   │   │   ├─ FileTreeTool.ts
│   │   │   ├─ GrepTool.ts
│   │   │   ├─ ReadFileTool.ts
│   │   │   ├─ UpdateTodoListTool.ts
│   │   │   ├─ WriteTool.ts
│   │   │   └─ index.ts
│   │   └─ utils/
│   │       ├─ Configuration.ts
│   │       ├─ FileSystemUtils.ts
│   │       ├─ GitIgnoreParser.ts
│   │       └─ provider/
│   │           ├─ LLMProvider.ts
│   │           ├─ ModelInfo.ts
│   │           └─ OpenRouter.ts
│   └─ workflows/
│       └─ ContinuousContext.ts
└─ tst/
    ├─ cli/
    │   └─ AgentTree.test.tsx
    └─ server/
        ├─ tasks/
        │   ├─ AgentContext.test.ts
        │   └─ TaskAgent.test.ts
        ├─ tools/
        │   └─ ReadFileTool.test.ts
        └─ utils/
            ├─ FileSystemUtils.test.ts
            └─ GitIgnoreParser.test.ts
```

### Selected Symbol Index

| Symbol                            | File                                        | Description                                                              |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `cli`                             | `src/App.tsx`                               | `meow` CLI definition (help, options).                                   |
| `render`                          | `src/App.tsx`                               | Ink `render` call that mounts `<Interface />`.                           |
| `Logger`                          | `src/Logger.ts`                             | `pino` logger instance (writes to `.orgchart/app.log`).                  |
| `initContextLogger`               | `src/Logger.ts`                             | Creates per‑agent context‑logging function.                              |
| `AgentStatus`                     | `src/server/IOTypes.ts`                     | Enum (`IDLE`, `THINKING`, `ACTING`, `WAITING`, `PAUSED`).                |
| `OrgchartEvent`                   | `src/server/IOTypes.ts`                     | `{id, title, content: StreamChunk[]}` used by UI.                        |
| `PromiseServer`                   | `src/server/PromiseServer.ts`               | Core server class (step loop, command handling).                         |
| `TaskAgent`                       | `src/server/tasks/TaskAgent.ts`             | State‑machine for a single agent.                                        |
| `AgentContext`                    | `src/server/tasks/AgentContext.ts`          | Block‑based conversation buffer.                                         |
| `Conversation`                    | `src/server/tasks/Conversation.ts`          | Simple two‑way message queue between parent/child agents.                |
| `ContinuousContextManager`        | `src/server/workflows/ContinuousContext.ts` | File‑watcher + LLM‑driven context document.                              |
| `getToolset`                      | `src/server/tools/index.ts`                 | Returns the toolbox for a given agent level.                             |
| `delegateWorkTool`                | `src/server/tools/DelegateWorkTool.ts`      | Factory that creates a `delegate_work` tool bound to the caller’s level. |
| `attemptCompletionToolDefinition` | `src/server/tools/AttemptCompletionTool.ts` | Final‑task completion tool.                                              |
| `readToolDefinition`              | `src/server/tools/ReadFileTool.ts`          | Reads a file (plain, PDF, DOCX).                                         |
| `writeToolDefinition`             | `src/server/tools/WriteTool.ts`             | Writes/overwrites a file.                                                |
| `editToolDefinition`              | `src/server/tools/EditTool.ts`              | Applies multiple in‑file edits.                                          |
| `bashToolDefinition`              | `src/server/tools/BashTool.ts`              | Executes a shell command safely.                                         |
| `grepToolDefinition`              | `src/server/tools/GrepTool.ts`              | Regex search across files.                                               |
| `fileTreeToolDefinition`          | `src/server/tools/FileTreeTool.ts`          | Returns the output of `getFileTree`.                                     |
| `LLMProvider.chatCompletion`      | `src/server/utils/provider/LLMProvider.ts`  | Calls OpenRouter API with retry & cost tracking.                         |
| `ModelInformation`                | `src/server/utils/provider/ModelInfo.ts`    | Token limits & pricing per model.                                        |
| `getFileTree`                     | `src/server/utils/FileSystemUtils.ts`       | Recursively builds a printable file‑tree (optionally with token counts). |
| `GitIgnoreParser`                 | `src/server/utils/GitIgnoreParser.ts`       | Parses `.gitignore` and `.git/info/exclude`.                             |
| `getConfig`                       | `src/server/utils/Configuration.ts`         | Returns the singleton configuration object.                              |

---

## Logical Flow

### Intra‑component flow

#### 1. CLI Application

- **Trigger – program start (`main`)** → `App.tsx` creates a `Logger` entry, parses args, and calls `render(<Interface />)`.
- **Effect – UI rendering** → `Interface` mounts:
  - **Effect – server init** → `useEffect` creates a new `PromiseServer` instance.
  - **Effect – polling** → a `setInterval` (250 ms) reads `server.getEvents()` and `server.getTotalSpend()`, updating local state.
- **Trigger – user types a command & presses Enter** → `CommandPanel` calls `onCommandSubmit(command)`.
- **Effect – server receives command** → `PromiseServer.sendCommand(command)`.
  - If command starts with `/` → `CommandRegistry` executes it (e.g., `/agent SeniorSoftwareEngineer`).
  - Otherwise → if the root agent is not started, `PromiseServer.startAgent(defaultAgent)` creates the root `TaskAgent`; the command text is added to the parent conversation (`Conversation.addMessage(PARENT, command)`).
- **Trigger – Escape key** → `Interface` calls `server.pause()`, which sets the active agent’s status to `PAUSED`.

#### 2. PromiseServer

- **Trigger – step interval** (`setInterval`) → `rootTaskAgent.step()` (and recursively each child).
- **Trigger – incoming command** (see above).
- **Effect – upsertEvent** → `events` array is updated (or replaced) and the UI will re‑render.
- **Effect – context update** → When a child agent finishes a `delegate_work` or `attempt_completion`, `PromiseServer.triggerContextUpdate()` calls `continuousContext.updateContext()`.

#### 3. TaskAgent (state machine)

| Current `status` | Trigger                                                                       | Effects (branching)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IDLE**         | `checkParentConversation` finds a `PARENT` message                            | • `addParentBlock` to `AgentContext` <br>• Emit `Starting Task – <agent.name>` event <br>• Reset `iterationCount` <br>• Set `status = THINKING`                                                                                                                                                                                                                                                                                                                                                               |
| **PAUSED**       | `step` called                                                                 | Returns early – no further processing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **THINKING**     | `iterationCount >= maxAgentIterations`                                        | Emit “Agent Max Cycles Exceeded” event, set `status = IDLE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **THINKING**     | `isLLMCallInProgress`                                                         | No new LLM call (wait).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **THINKING**     | otherwise                                                                     | • Set `isLLMCallInProgress = true` <br>• Increment `iterationCount` <br>• If `iterationCount === max-1` add a **final‑iteration warning** user block <br>• Call `LLMProvider.chatCompletion` with current `AgentContext` messages and the agent’s toolbox (or only `AttemptCompletion` on the final iteration).                                                                                                                                                                                               |
| **LLM response** | `processLLMResponse`                                                          | • Update `cost` & `contextUsed` from usage stats. <br>• If `tool_calls` present: store them, create **pending tool blocks** for each, set `currentToolIndex = 0`, `status = ACTING`. <br>• If no tool calls → log warning and pause (error path).                                                                                                                                                                                                                                                             |
| **ACTING**       | `stepActing` iterates over `currentToolCalls`                                 | For each tool call: <br>• Parse JSON args (error → log, pause). <br>• Find matching tool definition (`tools.find`). <br>• Call `tool.enact(args, this, writeEvent, toolCall.id)`. <br>• On success: `updateToolBlockResult` (replace pending placeholder). <br>• If tool is `AttemptCompletion` → `triggerContextUpdate()`, send result to parent, set `status = IDLE`. <br>• If tool is `delegate_work` → `triggerContextUpdate()`. <br>• Increment `currentToolIndex`; when all done → `status = THINKING`. |
| **WAITING**      | `checkChildConversations` finds a `CHILD` message with a pending tool call ID | • Update the pending tool block with the child’s result. <br>• Clear `pendingToolCallId`. <br>• Set `status = THINKING`.                                                                                                                                                                                                                                                                                                                                                                                      |
| **WAITING**      | `stepWaiting` sees **all children** `status === IDLE`                         | • `refreshProjectContext()` (optional) <br>• `status = THINKING`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Error handling** – any exception in tool execution, LLM call, or parsing sets `status = PAUSED`, logs the error, and emits a `Task Error` event.

#### 4. ContinuousContextManager

- **Trigger – `initialize()`** (called once by `PromiseServer`) →
  1. Calls `getFormattedContext()` → builds a markdown dump of the whole project.
  2. Sends a system prompt (`systemPrompt(true)`) + the project dump to the LLM (`chatCompletion`).
  3. Writes the LLM’s response to `PROJECT.md` and also writes a full‑tree snapshot to `FULL_CONTEXT.md`.
  4. Starts file watching via `startFileWatching(rootDir, handleFileEvent, gitIgnoreParser)`. |
- **Trigger – file system event** (`create|update|delete`) → `handleFileEvent` records the mutation in `fileMutations` (old/new content, type). |
- **Trigger – `updateContext()`** (called by a TaskAgent after delegation/completion) →
  1. If `fileMutations` empty → log and return.
  2. Build a mutation markdown document (`generateMutationDocument`).
  3. Concatenate with the existing `contextContent`.
  4. Call LLM with system prompt (`systemPrompt(false)`) + the combined text.
  5. Replace `contextContent` with the LLM’s new content, write `PROJECT.md`, clear `fileMutations`. |
- **Trigger – `destroy()`** (when the server shuts down) → unsubscribe the file‑watcher. |

#### 5. Tools

Each tool follows the same pattern:

1. **Emit an `OrgchartEvent`** (title includes the tool name and key argument).
2. **Perform the side‑effect** (read/write file, run a command, search, etc.).
3. **Return a string** (result or error message) that becomes the `tool` message in the LLM conversation.

The `delegate_work` tool additionally creates a new `TaskAgent` (child) with its own conversation, adds it to the parent’s `children` map, and puts the parent into `WAITING` until the child reports back.

---

## Development

| Command                                    | Purpose                                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                            | Removes `dist/`, formats code (`prettier -w .`), compiles TypeScript (`tsc` + `tsc-alias`), makes the generated `dist/src/App.js` executable. |
| `npm run dev`                              | Runs the app directly with `vite-node` (loads `.env`), entry point `src/App.tsx`.                                                             |
| `npm run dev:watch`                        | Same as `dev` but watches source files for changes (`-w`).                                                                                    |
| `npm test`                                 | Executes Vitest test suite (`tst/…`). Generates JUnit XML (`dist/junit.xml`) and coverage reports (`./coverage`).                             |
| `npm run format`                           | Runs Prettier in‑place on the whole repo.                                                                                                     |
| `npm run lint` _(not defined but typical)_ | Would run ESLint (project includes `eslint-plugin-react`).                                                                                    |
| `npm run start` _(not defined)_            | Not present – the CLI is launched via `node ./dist/src/App.js` after a build.                                                                 |

### CI / Coverage

- `vitest.config.ts` enables coverage collection (V8 engine) for all files under `tst/**/*`. Reports are emitted in text, HTML, JSON, LCOV, Cobertura, and a summary JSON.

### Testing

- **Component tests** – `AgentTree.test.tsx` uses `ink-testing-library` to verify tree rendering.
- **TaskAgent tests** – exhaustive unit tests covering state transitions, tool execution, error handling, context integration, and child delegation.
- **Tool tests** – `ReadFileTool.test.ts` validates file reading (plain, PDF, DOCX), error paths, and event emission.
- **Utility tests** – `FileSystemUtils.test.ts` checks `getFileTree` (depth, token counts, gitignore handling).
- **GitIgnoreParser tests** – ensure ignore patterns are loaded from `.gitignore` and `.git/info/exclude`.
- **ContinuousContext tests** – verify initialization, mutation tracking, context updates, and proper handling of concurrent updates.

---

## Style

| Aspect                    | Observation                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**              | TypeScript (ES2021 target) with `"module": "ESNext"` (via Vite). Strict null checks are disabled (`noUnusedLocals`/`noUnusedParameters` set to `false`).                                                                           |
| **Naming**                | `camelCase` for functions/variables, `PascalCase` for classes (`TaskAgent`, `Conversation`). Constants are `UPPER_SNAKE` (`AgentStatus`).                                                                                          |
| **Error handling**        | Centralised in `TaskAgent.handleError` → logs via `Logger.error`, pauses the agent, and emits a `Task Error` event. Tools catch their own errors and re‑throw to be handled by the agent.                                          |
| **Logging**               | `pino` logger writes JSON lines to `.orgchart/app.log`. `ContextLogger` writes per‑agent `context.json` files under `.orgchart/ContextLogs/<runId>/…`.                                                                             |
| **Modularity**            | Core concerns are separated: UI (`src/cli/*`), server logic (`src/server/*`), tooling (`src/server/tools/*`), agents (`src/server/agents/*`), utilities (`src/server/utils/*`).                                                    |
| **Configuration**         | Lazy singleton (`Configuration.ts`) ensures the LLM provider is instantiated only once; the config object is mutable via `updateConfig`.                                                                                           |
| **Testing pattern**       | Tests mock external dependencies (`fs`, `LLMProvider`, `Logger`) with Vitest’s `vi.mock`. Each test suite isolates the unit under test and verifies side‑effects (event emission, state changes).                                  |
| **Formatting**            | Prettier is enforced via `npm run format`. The repo contains a `.prettier` config imported from `@vdemedes/prettier-config`.                                                                                                       |
| **Dependency management** | Runtime dependencies include `ink`, `ink-big-text`, `marked-terminal`, `js-tiktoken`, `pdf-parse`, `mammoth`, `pino`, `@parcel/watcher`. Development dependencies include Vitest, React testing utilities, and TypeScript tooling. |
| **Build output**          | Compiled files are placed in `dist/` (ignored by git). The `bin` field in `package.json` points to `./dist/src/App.js`, making the package executable after `npm run build`.                                                       |

---

## Appendices

- **Key Prompt Snippets** – The system prompts for each agent are defined in their respective files (e.g., `TechnicalProductManager.ts`). They embed the full file‑tree via `${getFileTree()}` at runtime.
- **Tool Input Schemas** – All tools expose a JSON‑Schema `inputSchema` used by the LLM for function calling.
- **Agent Levels** – Agents have a numeric `level` (0 = L0, 9 = TechnicalProductManager). The `delegate_work` tool only offers agents with a lower level than the caller.

---

_End of Document_
