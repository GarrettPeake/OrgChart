### OrgChart

This is an app called org chart. It is composed of three components:

1. Interface: The CLI tool used by the user
2. Agents: LLM agents configured with:
   1. Model: The model which is used by the agent
   2. System prompt: The system prompt given to the agent
   3. ID: A short ID for the agent, i.e. "UXDesignMaster"
   4. Name: A friendly, informative name of the agent, i.e. "UX Master Designer"
   5. Description: Short description of this employee's purpose and toolset, i.e. "A master of user experience design"
   6. Tools: An array of tools usable by the agent
   7. Level: The level of this agent, described below
   8. Temperature: Passed to the model to control its level of randomness
3. Tools: Tools usable by an Agent

The app will be written in TypeScript to be run locally using NodeJs. It will use the `ink` package on NPM to create a beautiful user interface. It will use the OpenAI API spec to make LLM calls, for now only making calls to OpenRouter but this will be abstracted to `LLMProvider.ts`.

## Agents

An agent is just like any other coding agent. It is given a task, and then can perform tool calls to execute the task and finally invokes the `attempt_completion` tool to finish the task. The key difference with OrgChart is that agents can directly invoke other agents of a lower `Level` to complete subtasks. This enables agents to delegate tasks such as search, summarization, planning, or execution to other agents.

Example: The user might send the task "Create a django, react app with a landing page, username and password login page, and application page that shows the user's current balance. The user can add to their balance by checking out with stripe. Make a corresponding backend that supports these operations and remains extensible for future operations. Show me a plan before implementing." to the:

- Technical Product Manager agent. The TPM (L9) can then invoke a:
  _ Designer (L8) with the same task. The Designer might invoke a:
  _ Principal UX Designer (L7) to create the user workflows and define all of the necessary functionalities, then a:
  _ Principal Frontend Engineer (L7) to create a plan for implementing those functionalities in React, then a:
  _ Principal Backend Engineer (L7) to design the Django API required to implement the features while maintaining extensibility, and finally pass the aggregated plan to a: \* Design Reviewer (L0) to review the design and suggest modifications
  The Designer then returns the design to the TPM who shows it to the user. The TPM's context window is very clean while executing the task perfectly. It only contains the user's request and the design -- any file reading, researching, and thinking was done by the invoked agents. If the user asks for modifications, the TPM would invoke a Designer once again who would delegate the edits to the engineers if necessary. Then for implementation the TPM could pass the design to an L8 Product Manager who would invoke L7 principles to break the design down into sub tasks and then give subtasks to invoked L6 Senior Engineers, who might break them down further and give them to L5 Engineers and so forth.

It should be clear from the above example that a tree structure emerges as agents are invoked. Once an invoked agent uses the `attempt_completion` tool, it is considered dead and therefore any context it generated is lost, only the modifications it made and the message it returned in `attempt_completion` remain. If the invoking agent requires followup work, it must treat it as a separate task for a new agent. There are many agents that are L0 such as researcher, design reviewer, etc. Since these agents are L0, they can be invoked by any agent and cannot invoke other agents.

The tool used by an agent to invoke another agent is `delegate_task` and accepts the following arguments:

- Task: A string with a detailed description of the task to be completed by the invoked agent
- AgentId: The id of the agent to delegate to selected from an enum

## Interface

This app is a CLI tool which the user can open in any directory. It is written in `ink` and is broken down into small reusable components, not single large files.

On launch, the CLI tool displays an interactive list of all agents for the user to select from with accompanying descriptions. The agents are displayed vertically with a name column and a description column. The user can use the up and down arrow keys to change their selection, and press enter to make their selection.

Upon choosing their main agent, the CLI tool launches the app interface which expands to occupy the entire terminal.

The interface has a sticky header box which shows the current working directory, the task given by the user to the main agent, and the sum total API cost of all agents used for that task

The middle of the interface is two columns, each contained in a box. The left column displays the agent tree like a file tree structure using only text, the right column displays an event stream so the user can follow along with the progress and tool uses of the LLM.

Any messages from an agent to the user such as `ask_question` or `attempt_completion` are rendered in markdown using `ink-markdown`.

The event stream is a scrollable list of events. The most recent events appear at the bottom. Events are tool uses, agent changes, and LLM messages. These are displayed as bolded headers with the tool name with accompanying information shown as an indented subtitle.

The agent tree displays the agent invoked by the user at the top, then at each indent level displays the agents invoked by that agent. Agents which have finished their task are greyed out, agents that are waiting on the invoked agent to finish are white, and the currently executing agent is blue. Each agent has an `NN% - $KK.KK` following their name in the tree where NN is the percentage of that LLMs context window that is being used and KK.KK is the total API cost spent on that agent.

## Tools

The tools are defined in the ./src/tools directory (TODO: Update this section with all of the tools)

## Agents

Agents are defined in ./src/agents (TODO: Update this section with all of the agents)
