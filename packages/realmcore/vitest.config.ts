import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**'],
			reportsDirectory: './coverage',
			thresholds: {
				statements: 84,
				branches: 73,
				functions: 89,
				lines: 89,
			},
		},
	},
});
