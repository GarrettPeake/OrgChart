import {defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		reporters: ['default', 'junit'],
		silent: true,
		outputFile: {
			junit: 'dist/junit.xml',
		},
		coverage: {
			enabled: true,
			provider: 'v8',
			reportsDirectory: './coverage',
			include: ['tst/**/*'],
			reporter: [
				['text', {file: 'full-text-summary.txt'}],
				'html',
				'json',
				'lcov',
				'cobertura',
				['json-summary', {outputFile: 'coverage-summary.json'}],
			],
		},
	},
});
