import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**'],
			reportsDirectory: './coverage',
			thresholds: {
				statements: 19,
				branches: 12,
				functions: 17,
				lines: 20,
			},
		},
	},
});
