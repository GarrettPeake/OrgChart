import {describe, it, expect} from 'vitest';
import {buildAgentTreeComponents} from '@cli/AgentTree.js';
import {AgentStatus, TaskAgent} from '@server/tasks/TaskAgent.js';
import {Box} from 'ink';
import React from 'react';
import {render} from 'ink-testing-library';

// Mock TaskAgent for testing purposes
class MockTaskAgent {
	id: string;
	name: string;
	agent: {id: string; name: string} | null;
	contextPercent: number;
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
		this.agent = {id, name};
		this.contextPercent = contextPercent;
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
		expect(buildAgentTreeComponents(null)).toBeNull();
	});

	it('should render a single agent (root only)', () => {
		const rootAgent = new MockTaskAgent(
			'1',
			'RootAgent',
			50,
			10.0,
			'executing',
		);
		const output = renderTree(rootAgent);
		expect(output).toContain('RootAgent: 50.0% - $10.00 (executing)');
		expect(output).not.toContain('├');
		expect(output).not.toContain('└');
	});

	it('should render a multi-level agent tree with various depths', () => {
		const rootAgent = new MockTaskAgent('1', 'Root', 100, 20.0, 'exited', [
			new MockTaskAgent('2', 'Child1', 80, 5.0, 'executing', [
				new MockTaskAgent('3', 'Grandchild1', 60, 2.0, 'waiting'),
				new MockTaskAgent('4', 'Grandchild2', 70, 3.0, 'exited'),
			]),
			new MockTaskAgent('5', 'Child2', 90, 8.0, 'exited'),
		]);

		const output = renderTree(rootAgent);

		expect(output).toContain('Root: 100.0% - $20.00 (exited)');
		expect(output).toContain('├ Child1: 80.0% - $5.00 (executing)');
		expect(output).toContain('│ ├ Grandchild1: 60.0% - $2.00 (waiting)');
		expect(output).toContain('│ └ Grandchild2: 70.0% - $3.00 (exited)');
		expect(output).toContain('└ Child2: 90.0% - $8.00 (exited)');
	});

	it('should display correct agent information and status', () => {
		const rootAgent = new MockTaskAgent(
			'1',
			'TestAgent',
			75.5,
			15.25,
			'waiting',
		);
		const output = renderTree(rootAgent);
		expect(output).toContain('TestAgent: 75.5% - $15.25 (waiting)');
	});

	it('should handle agents with no children', () => {
		const rootAgent = new MockTaskAgent('1', 'Root', 100, 10.0, 'executing', [
			new MockTaskAgent('2', 'Child1', 50, 2.0, 'exited'),
			new MockTaskAgent('3', 'Child2', 60, 3.0, 'waiting'),
		]);
		const output = renderTree(rootAgent);
		expect(output).toContain('├ Child1: 50.0% - $2.00 (exited)');
		expect(output).toContain('└ Child2: 60.0% - $3.00 (waiting)');
	});

	it('should handle agents with multiple children', () => {
		const rootAgent = new MockTaskAgent('1', 'Root', 100, 10.0, 'executing', [
			new MockTaskAgent('2', 'Child1', 50, 2.0, 'exited'),
			new MockTaskAgent('3', 'Child2', 60, 3.0, 'waiting'),
			new MockTaskAgent('4', 'Child3', 70, 4.0, 'exited'),
		]);
		const output = renderTree(rootAgent);
		expect(output).toContain('├ Child1: 50.0% - $2.00 (exited)');
		expect(output).toContain('├ Child2: 60.0% - $3.00 (waiting)');
		expect(output).toContain('└ Child3: 70.0% - $4.00 (exited)');
	});

	it('should correctly apply tree branching characters', () => {
		const rootAgent = new MockTaskAgent('1', 'Root', 100, 20.0, 'exited', [
			new MockTaskAgent('2', 'Child1', 80, 5.0, 'executing', [
				new MockTaskAgent('3', 'Grandchild1', 60, 2.0, 'waiting'),
				new MockTaskAgent('4', 'Grandchild2', 70, 3.0, 'exited'),
			]),
			new MockTaskAgent('5', 'Child2', 90, 8.0, 'exited'),
		]);

		const output = renderTree(rootAgent);
		// Check for correct branching at each level
		expect(output).toMatch(/\n├ Child1/);
		expect(output).toMatch(/\n│ ├ Grandchild1/);
		expect(output).toMatch(/\n│ └ Grandchild2/);
		expect(output).toMatch(/\n└ Child2/);
	});

	it('should handle different agent statuses and their styling', () => {
		const rootAgent = new MockTaskAgent('1', 'Root', 100, 0, 'exited', [
			new MockTaskAgent('2', 'ExecutingAgent', 50, 1.0, 'executing'),
			new MockTaskAgent('3', 'ExitedAgent', 100, 2.0, 'exited'),
			new MockTaskAgent('4', 'WaitingAgent', 20, 0.5, 'waiting'),
			new MockTaskAgent('5', 'ErrorAgent', 0, 0, 'exited'),
		]);

		const output = renderTree(rootAgent);

		// Check for status text, ink-testing-library doesn't directly expose style, so we check text content
		expect(output).toContain('Root: 100.0% - $0.00 (exited)');
		expect(output).toContain('ExecutingAgent: 50.0% - $1.00 (executing)');
		expect(output).toContain('ExitedAgent: 100.0% - $2.00 (exited)');
		expect(output).toContain('WaitingAgent: 20.0% - $0.50 (waiting)');
		expect(output).toContain('ErrorAgent: 0.0% - $0.00 (exited)');
	});

	it('should handle an agent with an uninitialized agent property', () => {
		const rootAgent = new MockTaskAgent('1', 'Root', 100, 0, 'exited');
		rootAgent.agent = null; // Simulate uninitialized agent
		const output = renderTree(rootAgent);
		expect(output).toContain('initializing: 100.0% - $0.00 (exited)');
	});
});
