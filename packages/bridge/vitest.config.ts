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
				statements: 11,
				branches: 14,
				functions: 9,
				lines: 10,
			},
		},
	},
});
