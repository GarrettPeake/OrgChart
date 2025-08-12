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

CRITICAL REQUIREMENT: Base your analysis ONLY on what actually exists in the project files. Do not make assumptions about intent, purpose, or functionality that is not explicitly evident from the code, configuration files, or documentation. If the project appears incomplete or certain functionality is missing, describe what IS there, not what might be intended.

INSTRUCTIONS: Provide context based on every file present in the project that is not in the .gitignore. Here is a reference markdown template to use:

# Overview

If there are any files in the project which clearly state the intent of the project such as a README, the description in the package.json, or explicit documentation, provide an accurate assessment of that stated goal here. Otherwise, this section should summarize ONLY the actual functionality that exists in the current codebase without extrapolating or assuming what the purpose might be.

NEVER make assumptions about project intent. For example:
- GOOD: "The project contains TypeScript files that define agent configurations, a CLI interface using the ink library, and LLM provider abstractions for making API calls to language models"
- BAD: "This is an AI orchestration platform designed to revolutionize multi-agent workflows"

If the project code currently enables the processing of CSV files through defined processors, state exactly that. Do not extrapolate that this project is "Big data pipeline tooling" or make any assumptions beyond what the code actually does.

# Architecture

Break the project down into major system-level architectural components that actually exist in the codebase. Focus on high-level components such as:
- CLI applications
- Web frontend applications  
- Backend APIs/servers
- Desktop GUI applications
- Database systems
- Background services/daemons
- Microservices
- Lambda functions or serverless components
- Mobile applications
- Build systems or CI/CD pipelines

DO NOT treat individual classes, modules, or small code units as architectural components. These are implementation details that belong in the Structure section.

Example architectural components for different project types:
- **E-commerce system**: Frontend Web App, Backend API, Payment Service, Database, Admin Dashboard
- **CLI tool**: Command Line Interface, Configuration System, Plugin Architecture
- **Desktop app**: GUI Application, Background Sync Service, Local Database
- **Web service**: REST API Server, Authentication Service, File Storage System, Database
- **Flask API**: API Server (listing only a single component is OK if that is all that is defined!)

Include descriptions of how these architectural components interact with each other based on what you can observe in the code. Mention any known deployment characteristics like runtime environments, cloud providers, or containerization that are evident from configuration files. Assign a unique name to each architectural component so it can be referenced later.

# Interfaces

For each architectural component identified above, describe the actual interfaces, APIs, and interaction points that exist in the codebase. These must all be categorized into:

1. **Triggers** - How external systems, users, or other components interact with this component
2. **Effects** - How this component interacts with its dependencies or external systems

You must assign a symbol to each interaction so it can be distinctly referenced later in this document.

The entrypoint of the program should always be included in the triggers.

Examples for different types of architectural components:

## CLI Application

### Triggers
 * \`main\` program entry point that parses command line arguments
 * \`--config\` command line flag to specify configuration file location
 * \`process.stdin\` for interactive user input during execution

### Effects
 * \`readConfigFile\` loads configuration from filesystem
 * \`makeHttpRequest\` sends API calls to external services
 * \`writeOutputFile\` saves results to filesystem

## Backend API Server

### Triggers
 * \`POST /api/users\` HTTP endpoint to create new user accounts
 * \`GET /api/data\` HTTP endpoint to retrieve application data
 * \`startServer\` initialization function called at startup

### Effects
 * \`queryDatabase\` executes SQL queries against PostgreSQL database
 * \`sendEmail\` dispatches notifications via SMTP service
 * \`validateToken\` verifies JWT tokens with authentication service

## Desktop GUI Application

### Triggers
 * \`onStartup\` application launch handler
 * \`onMenuClick\` user menu selection events
 * \`onFileOpen\` file drag-and-drop or open dialog events

### Effects
 * \`renderWindow\` updates the GUI display
 * \`saveToLocalStorage\` persists user preferences
 * \`connectToServer\` establishes network connection for data sync

# Structure

Include the entire fileTree that was provided to you here.

Use nested subheaders to re-create the repository structure. You should include key symbols and type definitions but never code snippets that just contain logic as all logic should be analyzed and summarized.

Example follows:

## ./

<Document root-level files, specifically configuration files, build files, and documentation. For files whose purpose is to provide project context (like README files), incorporate any relevant information rather than just summarizing the file.>

### package.json

Node.js project with dependencies on express, typescript, jest for testing

### Dockerfile

Containerized deployment using Node.js 18 alpine base image, exposes port 3000

### tsconfig.json

TypeScript configuration with strict mode enabled, ES2020 target

### src/

#### <filename>.<extension>

Describe the actual functionality contained in each file based on what you can observe from the code. Focus on how that functionality is made accessible through exported functions, classes, or other symbols.

When including symbol information, use the actual definitions from the code:

Key symbols:
 * \`export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number\` calculates geographic distance in kilometers
 * \`export class DatabaseConnection\` manages PostgreSQL connection pool with methods for query execution
 * \`export const API_BASE_URL = "https://api.example.com"\` base URL constant for external API calls

#### subdirectories/

Continue documenting the actual directory structure and files that exist in the project.

# Logical Flow

This section should cover the actual execution flow and data flow between and within architectural components based on what you can observe in the code. This section should have two parts:
 1. "## Intra-component flow" which describes the how each triggers of a component leads to the different effects of the component. Effects and triggers are not 1:1 mapped, for example a single CLI action can trigger an API call, a database write, and a response message but when a DRYRUN=1 env var is present will skip the write and API call and just have a response message. Each component should have a section, and within that section each trigger should have a section that denotes all of the effects it can generate and how branching logic modifies which effects are generated.
 2. "## Inter-component flow" which describes how the effect of one component acts as the trigger of another and how that communication between components occurrs

This section should be written with the following style:  
* Reference actual functions, classes, and files using trigger/effect symbols like \`writeToDatabase\` or the key symbols and their associated files like '[\`calculateDistance()\`](utils/geo.ts)'
* Document branching logic and conditional paths that exist in the code
* Show the actual flow from entry points through the various components
* Provide a logical hierarchy showing how components depend on each other
* Include error handling flows and edge cases that are implemented

## Intra-component flow

### CLI Application

#### \`main\` trigger
The \`main\` entry point in [\`index.ts\`](src/index.ts) parses command line arguments using [\`parseArgs()\`](src/cli/ArgParser.ts). Based on the command provided:
- For \`--help\` flag: generates \`displayHelp\` effect only
- For \`sync\` command: generates \`readConfig\`, \`validateCredentials\`, and \`syncData\` effects in sequence
- For \`deploy\` command with \`--dry-run\` flag: generates \`readConfig\`, \`validateCredentials\`, and \`displayPlan\` effects, but skips \`executeDeployment\`
- For \`deploy\` command without flags: generates \`readConfig\`, \`validateCredentials\`, \`executeDeployment\`, and \`logResults\` effects

#### \`process.stdin\` trigger
Interactive input handling through [\`handleInput()\`](src/cli/InputHandler.ts):
- For \`quit\` or \`exit\` commands: generates \`cleanup\` and \`exit\` effects
- For configuration commands: generates \`validateInput\` effect, and if valid, \`updateConfig\` effect
- For invalid input: generates \`displayError\` effect only

### Backend API Server

#### \`POST /api/users\` trigger
The user creation endpoint in [\`UserController.ts\`](src/controllers/UserController.ts):
- Always generates \`validateInput\` effect first via [\`validateUserData()\`](src/validators/UserValidator.ts)
- If validation fails: generates \`sendErrorResponse\` effect and terminates
- If validation passes: generates \`checkDuplicateUser\` effect via [\`findUserByEmail()\`](src/repositories/UserRepository.ts)
- If duplicate found: generates \`sendErrorResponse\` effect with conflict status
- If unique: generates \`hashPassword\`, \`saveUser\`, \`sendWelcomeEmail\`, and \`sendSuccessResponse\` effects in parallel

#### \`GET /api/data\` trigger  
The data retrieval endpoint handles authentication and data fetching:
- Always generates \`validateToken\` effect via [\`verifyJWT()\`](src/auth/TokenManager.ts)
- If token invalid: generates \`sendUnauthorized\` effect and terminates
- If token valid but expired: generates \`sendTokenRefresh\` effect
- If token valid and fresh: generates \`queryDatabase\` effect, then based on user role:
  - Admin role: generates \`fetchAllData\` and \`sendResponse\` effects
  - Regular role: generates \`fetchUserData\` and \`sendResponse\` effects

## Inter-component flow

### CLI to Backend API Communication
The CLI's \`syncData\` effect triggers the Backend API's \`POST /api/sync\` trigger. The CLI uses [\`makeHttpRequest()\`](src/http/ApiClient.ts) to send authenticated requests. The API response triggers the CLI's \`processResponse\` effect, which can lead to either \`displaySuccess\` or \`handleError\` effects based on the HTTP status code.

### Backend API to Database Communication  
The Backend's \`queryDatabase\` effect triggers the Database's \`executeQuery\` trigger through [\`ConnectionPool.query()\`](src/database/ConnectionPool.ts). Database query results trigger the Backend's \`processQueryResult\` effect, which transforms the data before generating the \`sendResponse\` effect.

### Backend API to Email Service Communication
The Backend's \`sendWelcomeEmail\` effect triggers the Email Service's \`sendEmail\` trigger via [\`EmailProvider.send()\`](src/email/EmailProvider.ts). The Email Service's \`deliveryConfirmation\` effect triggers the Backend's \`logEmailDelivery\` trigger for audit purposes.

### Web Frontend to Backend API Communication
The Frontend's \`submitLogin\` effect (triggered by user form submission) triggers the Backend's \`POST /api/login\` trigger. Successful authentication triggers the Frontend's \`storeAuthToken\` and \`redirectToDashboard\` effects. Failed authentication triggers the Frontend's \`displayLoginError\` effect.

### Error Propagation Flow
When the Database generates an \`connectionError\` effect, it triggers the Backend's \`handleDatabaseError\` trigger, which generates a \`logError\` effect and a \`sendErrorResponse\` effect. This error response triggers the Frontend's \`handleApiError\` trigger (if called from frontend) or the CLI's \`handleApiError\` trigger (if called from CLI), both of which generate appropriate user-facing error display effects.

# Development

Document the actual development tools, scripts, and processes that exist in the project based on package.json scripts, Makefile targets, or other build configuration.

Example development information:
- **Testing**: \`npm test\` runs Jest test suite with coverage reporting
- **Building**: \`npm run build\` compiles TypeScript and bundles with Webpack
- **Local development**: \`npm run dev\` starts development server with hot reload on port 3000
- **Linting**: \`npm run lint\` executes ESLint with project-specific rules
- **Database**: \`docker-compose up\` starts local PostgreSQL instance for development
- **Deployment**: \`npm run deploy\` builds the CDK and deploys it to the configured AWS account

## Style

Document the actual coding patterns, naming conventions, and architectural patterns that are evident in the existing codebase

Example style information:
- **Language features**: Uses TypeScript with strict null checks, async/await patterns, ES6 modules
- **Naming**: camelCase for functions and variables, PascalCase for classes and interfaces
- **Error handling**: Custom error classes that extend built-in Error, consistent error response format in API
- **Testing**: Unit tests in \`__tests__\` directories, integration tests use test database
- **Architecture**: Follows MVC pattern with separate controller, service, and repository layers
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
				temperature: 0.2,
				stream: false,
				provider: {
					sort: 'price',
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
