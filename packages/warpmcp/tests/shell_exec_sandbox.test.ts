// Regression tests for the shell_exec sandbox hardening added after the security
// audit: no env-dump commands, absolute-path confinement of arguments, and a
// scrubbed child environment.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildChildEnv, validateShellCommand, ShellCommandValidationError } from '../src/tools/shell_exec';

const isWindows = process.platform === 'win32';
const OUTSIDE_PATH = isWindows ? 'C:\\Windows\\win.ini' : '/etc/passwd';

function tempRoot(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'warpmcp-root-'));
}

function expectRejected(command: string, pattern: RegExp, roots?: string[], cwd?: string): void {
	try {
		validateShellCommand(command, roots, cwd);
		expect.unreachable(`expected rejection for: ${command}`);
	} catch (err) {
		expect(err).toBeInstanceOf(ShellCommandValidationError);
		expect((err as Error).message).toMatch(pattern);
	}
}

describe('shell_exec — environment disclosure', () => {
	it('rejects env and printenv', () => {
		// `env <prog>` also executes arbitrary programs, so these were a full
		// allowlist bypass on top of the secret dump.
		expectRejected('env', /not in the allowed list/);
		expectRejected('printenv', /not in the allowed list/);
		expectRejected('env rm -rf /tmp/x', /not in the allowed list/);
	});

	it('scrubs non-essential variables from the child environment', () => {
		const child = buildChildEnv({
			PATH: process.env.PATH ?? 'C:\\Windows\\system32',
			HOME: '/home/user',
			GITHUB_TOKEN: 'ghp_secret',
			OPENAI_API_KEY: 'sk-secret',
			AWS_SECRET_ACCESS_KEY: 'aws-secret',
			MY_APP_SECRET: 'nope',
		} as NodeJS.ProcessEnv);

		expect(child.PATH).toBeDefined();
		expect(child.HOME).toBe('/home/user');
		expect(child.GITHUB_TOKEN).toBeUndefined();
		expect(child.OPENAI_API_KEY).toBeUndefined();
		expect(child.AWS_SECRET_ACCESS_KEY).toBeUndefined();
		expect(child.MY_APP_SECRET).toBeUndefined();
	});

	it('forces non-interactive git and CI mode', () => {
		const child = buildChildEnv({ PATH: 'x' } as NodeJS.ProcessEnv);
		// Without this, a git command that wants credentials blocks forever on a
		// hidden prompt inside a tool call.
		expect(child.GIT_TERMINAL_PROMPT).toBe('0');
		expect(child.CI).toBe('true');
	});
});

describe('shell_exec — absolute-path confinement', () => {
	it('rejects absolute paths outside the allowed roots', () => {
		const root = tempRoot();
		expectRejected(`cat ${OUTSIDE_PATH}`, /outside the allowed roots/, [root]);
		expectRejected(`cat ${OUTSIDE_PATH}`, /outside the allowed roots/, [tempRoot()]);
	});

	it('accepts absolute paths inside an allowed root', () => {
		const root = tempRoot();
		const inside = path.join(root, 'src', 'index.ts');
		expect(() => validateShellCommand(`cat ${inside}`, [root])).not.toThrow();
	});

	it('does not mistake URLs and relative paths for absolute paths', () => {
		const root = tempRoot();
		expect(() => validateShellCommand('git clone https://github.com/a/b.git', [root])).not.toThrow();
		expect(() => validateShellCommand('cat ./src/index.ts', [root])).not.toThrow();
		expect(() => validateShellCommand('cat src/index.ts', [root])).not.toThrow();
	});

	it('rejects traversal forms in arguments', () => {
		const root = tempRoot();
		expectRejected('cat ../secret', /Path traversal/, [root]);
		expectRejected('cat ..', /Path traversal/, [root]);
		expectRejected('cat %APPDATA%\\file', /Path traversal/, [root]);
	});

	it('skips path confinement when no roots are configured', () => {
		// Roots come from the server configuration; with none set the tool runs in
		// its documented unrestricted mode rather than pretending to confine.
		expect(() => validateShellCommand(`cat ${OUTSIDE_PATH}`)).not.toThrow();
	});
});

describe('shell_exec — runtime preloading', () => {
	it('rejects module-preloading flags on allowlisted runtimes', () => {
		// -r/--require/--import/--loader load arbitrary code before the entry file,
		// which is equivalent to -e for an attacker.
		expectRejected('node -r ./evil.js server.js', /evaluate arbitrary code/);
		expectRejected('node --require ./evil.js server.js', /evaluate arbitrary code/);
		expectRejected('node --import ./evil.mjs server.js', /evaluate arbitrary code/);
		expectRejected('node --loader ./x.mjs server.js', /evaluate arbitrary code/);
	});

	it('still allows running project entry points', () => {
		expect(() => validateShellCommand('node server.js')).not.toThrow();
		expect(() => validateShellCommand('npm run build')).not.toThrow();
	});
});
