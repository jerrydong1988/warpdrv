// Unit tests for the shell_exec allowlist validator.
// These pin the sandbox guarantees: no shells, no eval flags, no
// metacharacters, no credential injection, no path traversal.
import { describe, it, expect } from 'vitest';
import { validateShellCommand, ShellCommandValidationError } from '../src/tools/shell_exec';

function expectRejected(command: string, pattern: RegExp): void {
	try {
		validateShellCommand(command);
		expect.unreachable(`expected rejection for: ${command}`);
	} catch (err) {
		expect(err).toBeInstanceOf(ShellCommandValidationError);
		expect((err as Error).message).toMatch(pattern);
	}
}

describe('validateShellCommand — allowlist', () => {
	it('accepts allowlisted commands with plain args', () => {
		expect(() => validateShellCommand('ls -la')).not.toThrow();
		expect(() => validateShellCommand('git status')).not.toThrow();
		expect(() => validateShellCommand('node server.js')).not.toThrow();
		expect(() => validateShellCommand('npm run build')).not.toThrow();
	});

	it('accepts read-only resource inspection commands across platforms', () => {
		expect(() => validateShellCommand('Get-Process')).not.toThrow();
		expect(() => validateShellCommand('Get-CimInstance Win32_OperatingSystem')).not.toThrow();
		expect(() => validateShellCommand('systeminfo')).not.toThrow();
		expect(() => validateShellCommand('top -bn1')).not.toThrow();
		expect(() => validateShellCommand('free -h')).not.toThrow();
		expect(() => validateShellCommand('df -h')).not.toThrow();
		expect(() => validateShellCommand('uptime')).not.toThrow();
	});

	it('rejects non-allowlisted executables', () => {
		expectRejected('python3 script.py', /not in the allowed list/);
		expectRejected('curl https://example.com', /not in the allowed list/);
	});

	it('rejects shell interpreters', () => {
		expectRejected('bash script.sh', /not in the allowed list/);
		expectRejected('powershell -File x.ps1', /not in the allowed list/);
		expectRejected('cmd /c dir', /not in the allowed list/);
	});
});

describe('validateShellCommand — injection hardening', () => {
	it('rejects empty and whitespace-only commands', () => {
		expectRejected('', /non-empty|empty/);
		expectRejected('   ', /empty/);
	});

	it('rejects control characters (newlines, tabs)', () => {
		expectRejected('ls\nrm -rf /', /Control characters/);
		expectRejected('ls\t-rf', /Control characters/);
	});

	it('rejects shell metacharacters', () => {
		expectRejected('ls | grep x', /metacharacters/);
		expectRejected('ls || rm -rf /', /metacharacters/);
		expectRejected('ls; rm -rf /', /metacharacters/);
		expectRejected('echo $(whoami)', /metacharacters/);
		expectRejected('echo $HOME', /metacharacters/);
		expectRejected('echo `id`', /metacharacters/);
		expectRejected('ls > /tmp/out', /metacharacters/);
	});

	it('rejects eval-style flags on runtimes', () => {
		// NB: metacharacter-containing payloads are caught earlier; these
		// cases exercise the eval-flag check with otherwise-legal commands.
		expectRejected('node -e console.log', /evaluate arbitrary code/);
		expectRejected('npm -c x', /evaluate arbitrary code/);
		expectRejected('node --eval x', /evaluate arbitrary code/);
		expectRejected('node -p 1+1', /evaluate arbitrary code/);
		expectRejected('npx -c echo hi', /evaluate arbitrary code/);
		expectRejected('python --eval "x"', /not in the allowed list/); // python not allowlisted anyway
	});

	it('keeps legitimate flags on non-runtime commands', () => {
		// Regression guard: the eval-flag check must not leak onto plain
		// commands whose flags collide with eval flags (-p/-r/-c/-i).
		expect(() => validateShellCommand('mkdir -p foo')).not.toThrow();
		expect(() => validateShellCommand('cp -r a b')).not.toThrow();
		expect(() => validateShellCommand('rm -r d')).not.toThrow();
		expect(() => validateShellCommand('grep -i x f')).not.toThrow();
		expect(() => validateShellCommand('wc -c f')).not.toThrow();
		expect(() => validateShellCommand('cargo build -r')).not.toThrow();
		expect(() => validateShellCommand('npx -p typescript tsc --version')).not.toThrow();
	});

	it('rejects credential assignments in args', () => {
		expectRejected('git clone https://TOKEN=x@example.com/repo', /credential assignments/);
		expectRejected('curl http://x -H "API_KEY=secret"', /not in the allowed list|credential assignments/);
	});

	it('rejects path traversal and env-var patterns', () => {
		expectRejected('cat ../etc/passwd', /Path traversal/);
		expectRejected('cat %APPDATA%\\file', /Path traversal/);
	});

	it('accepts safe quoted commands', () => {
		expect(() => validateShellCommand('git commit -m "fix: thing"')).not.toThrow();
		expect(() => validateShellCommand('ls "my dir"')).not.toThrow();
	});
});
