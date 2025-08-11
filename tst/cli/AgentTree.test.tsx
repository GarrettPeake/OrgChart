import {describe, it, expect} from 'vitest';
import {buildAgentTreeComponents} from '@cli/AgentTree.js';
import {AgentStatus} from '@server/IOTypes.js';
import {Box} from 'ink';
import React from 'react';
import {render} from 'ink-testing-library';

// Mock TaskAgent for testing purposes
class MockTaskAgent {
	id: string;
	name: string;
	description: string;
	contextUsage: number;
	maxContext: number;
	cost: number;
	status: AgentStatus;
	children: any;

	constructor(
		id: string,
		name: string,
		contextPercent: number,
		cost: number,
		status: AgentStatus,
		children: MockTaskAgent[] = [],
	) {
		this.id = id;
		this.name = name;
		this.description = `${name} description`;
		this.maxContext = 1000; // Fixed max context
		this.contextUsage = (contextPercent / 100) * this.maxContext; // Convert percentage to usage
		this.cost = cost;
		this.status = status;
		this.children = children;
	}
}

describe('buildAgentTreeComponents', () => {
	// Helper to render components and get the output string
	const renderTree = (rootTaskRunner: MockTaskAgent | null) => {
		const {lastFrame} = render(
			React.createElement(
				Box,
				{},
				buildAgentTreeComponents(rootTaskRunner as any),
			),
		);
		return lastFrame();
	};

	it('should return null for an empty/null agent tree', () => {
		expect(buildAgentTreeComponents(undefined)).toBeNull();
	});

	it('should render a single agent (root only)', () => {
		const rootAgent = new MockTaskAgent(
			'1',
			'RootAgent',
			50,
			10.0,
			AgentStatus.THINKING,
		);
		const output = renderTree(rootAgent);
		expect(output).toContain('RootAgent: 50.0% - $10.00 (thinking)');
		expect(output).not.toContain('├');
		expect(output).not.toContain('└');
	});

	it('should render a multi-level agent tree with various depths', () => {
		const rootAgent = new MockTaskAgent(
			'1',
			'Root',
			100,
			20.0,
			AgentStatus.IDLE,
			[
				new MockTaskAgent('2', 'Child1', 80, 5.0, AgentStatus.THINKING, [
					new MockTaskAgent('3', 'Grandchild1', 60, 2.0, AgentStatus.WAITING),
					new MockTaskAgent('4', 'Grandchild2', 70, 3.0, AgentStatus.IDLE),
				]),
				new MockTaskAgent('5', 'Child2', 90, 8.0, AgentStatus.IDLE),
			],
		);

		const output = renderTree(rootAgent);

		expect(output).toContain('Root: 100.0% - $20.00 (idle)');
		expect(output).toContain('├ Child1: 80.0% - $5.00 (thinking)');
		expect(output).toContain('│ ├ Grandchild1: 60.0% - $2.00 (waiting)');
		expect(output).toContain('│ └ Grandchild2: 70.0% - $3.00 (idle)');
		expect(output).toContain('└ Child2: 90.0% - $8.00 (idle)');
	});

	it('should display correct agent information and status', () => {
		const rootAgent = new MockTaskAgent(
			'1',
			'TestAgent',
			75.5,
			15.25,
			AgentStatus.WAITING,
		);
		const output = renderTree(rootAgent);
		expect(output).toContain('TestAgent: 75.5% - $15.25 (waiting)');
	});

	it('should handle agents with no children', () => {
		const rootAgent = new MockTaskAgent(
			'1',
			'Root',
			100,
			10.0,
			AgentStatus.THINKING,
			[
				new MockTaskAgent('2', 'Child1', 50, 2.0, AgentStatus.IDLE),
				new MockTaskAgent('3', 'Child2', 60, 3.0, AgentStatus.WAITING),
			],
		);
		const output = renderTree(rootAgent);
		expect(output).toContain('├ Child1: 50.0% - $2.00 (idle)');
		expect(output).toContain('└ Child2: 60.0% - $3.00 (waiting)');
	});

	it('should handle agents with multiple children', () => {
		const rootAgent = new MockTaskAgent(
			'1',
			'Root',
			100,
			10.0,
			AgentStatus.THINKING,
			[
				new MockTaskAgent('2', 'Child1', 50, 2.0, AgentStatus.IDLE),
				new MockTaskAgent('3', 'Child2', 60, 3.0, AgentStatus.WAITING),
				new MockTaskAgent('4', 'Child3', 70, 4.0, AgentStatus.IDLE),
			],
		);
		const output = renderTree(rootAgent);
		expect(output).toContain('├ Child1: 50.0% - $2.00 (idle)');
		expect(output).toContain('├ Child2: 60.0% - $3.00 (waiting)');
		expect(output).toContain('└ Child3: 70.0% - $4.00 (idle)');
	});

	it('should correctly apply tree branching characters', () => {
		const rootAgent = new MockTaskAgent(
			'1',
			'Root',
			100,
			20.0,
			AgentStatus.IDLE,
			[
				new MockTaskAgent('2', 'Child1', 80, 5.0, AgentStatus.THINKING, [
					new MockTaskAgent('3', 'Grandchild1', 60, 2.0, AgentStatus.WAITING),
					new MockTaskAgent('4', 'Grandchild2', 70, 3.0, AgentStatus.IDLE),
				]),
				new MockTaskAgent('5', 'Child2', 90, 8.0, AgentStatus.IDLE),
			],
		);

		const output = renderTree(rootAgent);
		// Check for correct branching at each level
		expect(output).toMatch(/\n├ Child1/);
		expect(output).toMatch(/\n│ ├ Grandchild1/);
		expect(output).toMatch(/\n│ └ Grandchild2/);
		expect(output).toMatch(/\n└ Child2/);
	});

	it('should handle different agent statuses and their styling', () => {
		const rootAgent = new MockTaskAgent('1', 'Root', 100, 0, AgentStatus.IDLE, [
			new MockTaskAgent('2', 'ExecutingAgent', 50, 1.0, AgentStatus.THINKING),
			new MockTaskAgent('3', 'ExitedAgent', 100, 2.0, AgentStatus.IDLE),
			new MockTaskAgent('4', 'WaitingAgent', 20, 0.5, AgentStatus.WAITING),
			new MockTaskAgent('5', 'ErrorAgent', 0, 0, AgentStatus.IDLE),
		]);

		const output = renderTree(rootAgent);

		// Check for status text, ink-testing-library doesn't directly expose style, so we check text content
		expect(output).toContain('Root: 100.0% - $0.00 (idle)');
		expect(output).toContain('ExecutingAgent: 50.0% - $1.00 (thinking)');
		expect(output).toContain('ExitedAgent: 100.0% - $2.00 (idle)');
		expect(output).toContain('WaitingAgent: 20.0% - $0.50 (waiting)');
		expect(output).toContain('ErrorAgent: 0.0% - $0.00 (idle)');
	});

	it('should handle edge case with zero context usage', () => {
		const rootAgent = new MockTaskAgent('1', 'Root', 0, 0, AgentStatus.IDLE);
		const output = renderTree(rootAgent);
		expect(output).toContain('Root: 0.0% - $0.00 (idle)');
	});
});
