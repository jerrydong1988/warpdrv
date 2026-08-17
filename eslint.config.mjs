// ESLint flat config — scoped to the core TypeScript packages.
// `shared` and `realmcore` are the composite packages that CI builds
// with `tsc -b`; keeping them lint-clean is the gate. Server/app are
// typechecked separately (their larger surface is migrated incrementally).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['**/dist/**', '**/node_modules/**', 'packages/desktop/gen/**', 'packages/app/dist/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['packages/shared/src/**/*.ts', 'packages/realmcore/src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Project conventions (CONTRIBUTING.md): no `any`, no unused vars.
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
		},
	},
);
