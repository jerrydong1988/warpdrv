import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**'],
			exclude: ['src/**/*.old'],
			reportsDirectory: './coverage',
			thresholds: {
				statements: 0.8,
				branches: 0.75,
				functions: 0.7,
				lines: 0.75,
			},
		},
	},
});
