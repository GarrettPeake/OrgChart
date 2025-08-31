# OrgChart: Multi-Agent Coder

## Project Overview

OrgChart is a terminal-based multi-agent coder. A single task is broken into many and delegated down a tree of agents to perform small units of work with groomed context without corroding the context of the user-facing agent. Each agent has a specialized role, .e.g. Technical Product Manager, Software Engineers, Designers.

## Installation

**Clone the repository**:

```bash
git clone [repository-url]
cd orgchart
```

**Install dependencies**:

```bash
npm install
```

**Build the project (optional, but recommended for production use)**:

```bash
npm run build
```

## Usage

### Running the CLI

To start the OrgChart CLI, use the following command:

```bash
npm run dev
```

This will launch the terminal UI, and the root agent (by default, `TechnicalProductManager`) to receive your task.

### Basic Interaction

- **Sending Commands**: Any input is sent as a task to the currently executing agent
- **Special Commands**: The CLI supports special commands prefixed with `/` for system-level actions:
  - `/aiignore`: Generates or updates `.aiignore` patterns to exclude files from AI context based on the current project structure.
  - `/agent <agentId>`: Changes the active top-level agent for the next task. For example, `/agent JuniorSoftwareEngineer`.
- **Pausing and Resuming**: Press `Esc` to pause the active agent. You can then send new input to resume its operation.

### Agent Delegation

The core feature of OrgChart is its ability to delegate tasks. When a complex task is given to a high-level agent, it can break down the task and delegate specific sub-tasks to more specialized child agents. These delegations are shown in the agent tree. Your best bet is to steer the main agent by describing the delegation structure. (i.e. "Write tests for all of the `Animal` classes, each agent should write a single test class")

## Architecture Overview

OrgChart is built as a single Node.js process, orchestrating various components to deliver its multi-agent capabilities.

- **CLI Application (`src/App.tsx`)**: The entry point for the user. It parses CLI flags, renders the interactive terminal UI using **Ink** (React for terminals), and starts the `PromiseServer`.
- **Promise-based "Server" (`src/server/PromiseServer.ts`)**: The core backend that holds the root `TaskAgent`, manages the command registry, handles the event stream, and orchestrates agent interactions, tool execution, and LLM calls.
- **TaskAgent (`src/server/tasks/TaskAgent.ts`)**: Represents an individual AI agent. Each `TaskAgent` is a state machine (IDLE, THINKING, ACTING, WAITING, PAUSED) that manages its own `AgentContext`, child agents, and a `Conversation` with its parent or the user. A `TaskAgent` is a node in a DAG of all agents.
- **Continuous Context Manager (`src/workflows/ContinuousContext.ts`)**: A background process that watches the project directory for file mutations. It periodically leverages an LLM to update a single `PROJECT.md` document, ensuring all agents have a current summary of the codebase.
- **Tool Suite (`src/server/tools/`)**: A collection of individual tools (e.g., Read, Write, Edit, Bash, Grep, FileTree, DelegateWork, UpdateTodoList, AttemptCompletion) that agents can invoke. Each tool performs a specific action and returns results to the agent.
- **LLM Provider (`src/server/dependencies/provider/OpenrouterProvider.ts`)**: A wrapper around the OpenRouter API that handles communication with the LLMs, including retries, token cost accounting, and conversion of tool calls.

## Development

This section provides information for developers interested in contributing to or understanding the OrgChart project.

### Running Tests

OrgChart uses **Vitest** for its test suite. To run all tests:

```bash
npm test
```

Coverage reports will be generated in the `./coverage` directory.

### Project Structure Overview

```
/
├─ .aiignore                    # AI-generated ignore patterns
├─ .gitignore                   # Standard git ignore
├─ .orgchart/                   # Runtime generated files (context logs, PROJECT.md)
├─ src/
│   ├─ App.tsx                  # CLI entry point
│   ├─ cli/                     # CLI UI components (AgentTree, CommandPanel, EventStream)
│   ├─ server/
│   │   ├─ IOTypes.ts           # Shared enums & type definitions
│   │   ├─ PromiseServer.ts     # Core server class
│   │   ├─ agents/              # Agent definitions (SWE, Designer, Management, L0)
│   │   ├─ commands/            # CLI commands (/aiignore, /agent)
│   │   ├─ dependencies/        # Configuration, Logger, LLM Provider
│   │   ├─ tasks/               # AgentContext, Conversation, TaskAgent
│   │   ├─ tools/               # Tool definitions (Read, Write, Edit, Bash, etc.)
│   │   └─ workflows/           # ContinuousContextManager
│   └─ utils/                   # FileSystemUtils, GitIgnoreParser
├─ tst/                         # Unit and integration tests
├─ vite.config.ts               # Vite configuration
└─ vitest.config.ts             # Vitest configuration
```

## Configuration

### LLM Providers

Currently only OpenRouter is provided, you'll need to export your API key in your environment

```dotenv
OPENROUTER_API_KEY="your_openrouter_api_key_here"
```

### `.aiignore`

The `.aiignore` file (generated by the `/aiignore` command) specifies patterns for files and directories that should be excluded from the AI's continuous context. This helps agents focus on relevant code and reduces token usage.

### Agent Selection

By default, the `TechnicalProductManager` is the root agent. You can change this for a specific task using the `/agent` command, or potentially configure a different default in `src/server/dependencies/Configuration.ts` or via an environment variable.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](LICENSE) file for details.
