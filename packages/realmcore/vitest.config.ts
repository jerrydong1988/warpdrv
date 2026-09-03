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
				statements: 73,
				branches: 70,
				functions: 71,
				lines: 75,
			},
		},
	},
});
