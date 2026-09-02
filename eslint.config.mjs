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
	{
		// Incremental lint gate for server: unused vars/imports are enforced
		// (a real bug source), while `any` cleanup is deferred.
		// TODO(lint): the server (~49) and app (~122) `any` usages will be
		// typed in a follow-up migration; flip no-explicit-any to 'error' once
		// they are gone.
		files: ['packages/server/src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
	{
		// App: recommended rules are errors. no-unused-vars stays a warning
		// for now — the app carries ~300 historical unused imports/vars
		// (mostly shadcn-template leftovers) that are being cleared in
		// follow-up sweeps; warnings stay visible in CI output.
		files: ['packages/app/src/**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
);
