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
				statements: 11.5,
				branches: 14,
				functions: 10,
				lines: 11,
			},
		},
	},
});
