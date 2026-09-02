// ESLint flat config — scoped to the core TypeScript packages.
// `shared`, `realmcore` and `bridge` are the typed-lint packages; CI builds
// shared/realmcore with `tsc -b` and typechecks bridge/server/app/warpmcp
// directly. Server/app are linted incrementally (their larger surface is
// migrated gradually), but all packages are typechecked.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['**/dist/**', '**/node_modules/**', 'packages/desktop/gen/**', 'packages/app/dist/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['packages/shared/src/**/*.ts', 'packages/realmcore/src/**/*.ts', 'packages/bridge/src/**/*.ts'],
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
