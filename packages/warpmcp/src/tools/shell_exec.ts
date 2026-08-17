import { spawn } from 'child_process';
import { getShellSpec } from '../util/shellCmd';

// Only these commands are permitted — no shells, no eval-style flags.
// Shells (bash/sh/zsh/fish/powershell/cmd) are deliberately excluded:
// executing the whole command via `-c` would make the allowlist pointless.
const ALLOWED_COMMANDS = new Set([
	'npx','npm','node','pnpm','yarn',
	'cargo','rustc','clippy-driver',
	'git','gh',
	'cat','head','tail','wc','sort','uniq','grep','sed','awk','find','ls','mkdir','cp','mv','rm','touch','chmod','chown','ln',
	'dir','type','echo','printenv','env','which','where','whoami','hostname','date','time',
	// Read-only system inspection commands. Pipelines, redirects, subshells and
	// statement separators remain blocked below, so these cannot be chained
	// into mutation commands.
	'top','free','df','du','ps','uptime','vmstat','iostat','lscpu','nproc','vm_stat',
	'systeminfo','tasklist',
	'get-date','get-process','get-ciminstance','get-counter','get-psdrive','get-computerinfo',
	'get-volume','get-nettcpconnection','get-netadapterstatistics',
]);

// Flags that make the (still allowlisted) runtimes evaluate arbitrary code
const EVAL_FLAGS = ['-e', '-p', '--eval', '--print', '-c', '--check', '-i', '--interactive'];

export const shellExecDefinition = {
	name: 'shell_exec',
	description: 'Execute one allowlisted command. Uses bash on Linux/macOS and PowerShell on Windows. For Windows resource inspection, use commands such as Get-Process, Get-CimInstance, Get-Counter and Get-PSDrive; for Linux/macOS, use commands such as top, free, df, ps and uptime. Pipelines, redirects, command chaining and shell interpreters are rejected.',
	inputSchema: {
		type: 'object',
		properties: {
			command: { type: 'string', description: 'One allowlisted command with arguments. On Windows, prefer PowerShell-native read-only inspection commands instead of Unix commands.' },
			cwd: { type: 'string', description: 'Working directory (optional).' },
			timeout: { type: 'number', description: 'Timeout in milliseconds (default 60000).', default: 60000 },
		},
		required: ['command'],
	},
	resultLimit: 40960,
};

export class ShellCommandValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ShellCommandValidationError';
	}
}

function extractFirstToken(command: string): string {
	// Handle quoted and escaped forms; strip leading whitespace
	const trimmed = command.trimStart();
	if (trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith('`')) {
		return '';
	}
	const match = trimmed.match(/^(\S+)/);
	return match ? match[1]! : '';
}

function getCommandBase(token: string): string {
	// Extract basename: "path/to/node" -> "node", "%ProgramFiles%\\x\\y.exe" -> "y.exe"
	const lastSep = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'));
	return lastSep >= 0 ? token.slice(lastSep + 1).toLowerCase() : token.toLowerCase();
}

export function validateShellCommand(command: string): void {
	if (!command || typeof command !== 'string') {
		throw new ShellCommandValidationError('Command must be a non-empty string');
	}

	const trimmed = command.trim();
	if (trimmed.length === 0) {
		throw new ShellCommandValidationError('Command cannot be empty');
	}

	// Reject all control characters (newlines, tabs, CR, etc.) — the command
	// is executed via `bash -c` / `powershell -Command`, where a newline is a
	// statement separator and would bypass the metacharacter blocklist below.
	if (/[\x00-\x1f\x7f]/.test(command)) {
		throw new ShellCommandValidationError('Control characters (newlines, tabs, etc.) are not allowed');
	}

	// Block all shell metacharacters that enable injection
	// Note: `||` must be checked before single `|`; path traversal with encoded dots also blocked
	if (/\|\||[|;&`$()<>{}\[\]!]/.test(trimmed)) {
		throw new ShellCommandValidationError('Shell metacharacters are not allowed (pipes, semicolons, subshells, variable expansion, etc.)');
	}

	const firstToken = extractFirstToken(trimmed);
	if (!firstToken) {
		throw new ShellCommandValidationError('Command must start with an executable name');
	}

	const base = getCommandBase(firstToken);
	if (!ALLOWED_COMMANDS.has(base)) {
		throw new ShellCommandValidationError(`Command '${base}' is not in the allowed list`);
	}

	// Block eval-style flags on the allowlisted runtimes (node -e, npm -c, etc.)
	const argsPart = trimmed.slice(firstToken.length).trim();
	const flagMatch = argsPart.match(/-{1,2}[a-zA-Z]+/g);
	if (flagMatch && flagMatch.some(f => EVAL_FLAGS.includes(f.toLowerCase()))) {
		throw new ShellCommandValidationError(`Flag '${flagMatch.find(f => EVAL_FLAGS.includes(f.toLowerCase()))}' is not allowed (would evaluate arbitrary code)`);
	}

	// Block common env-injection patterns in remaining args
	if (/\b(PASSWORD|SECRET|API_KEY|TOKEN|PRIVATE_KEY)=/.test(argsPart)) {
		throw new ShellCommandValidationError('Embedding credential assignments in command args is not allowed');
	}

	// Block path-traversal patterns in args (including multi-dot variants)
	if (/[\.\.][\/\\]/.test(argsPart) || /%.*%/.test(argsPart) || /\.{2,}[\/\\]/.test(argsPart)) {
		throw new ShellCommandValidationError('Path traversal or env-variable references in arguments are not allowed');
	}
}

export async function shellExecHandler(
	args: { command: string; cwd?: string; timeout?: number },
	allowedRoots?: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	validateShellCommand(args.command);

	// Restrict working directory to configured allowed roots
	if (args.cwd) {
		const pathMod = await import('path');
		const fsp = await import('fs/promises');
		let resolvedCwd: string;
		try {
			resolvedCwd = pathMod.resolve(args.cwd);
		} catch {
			throw new ShellCommandValidationError(`Invalid cwd: ${args.cwd}`);
		}
		if (allowedRoots && allowedRoots.length > 0) {
			// Lexical containment (both separator styles)…
			const lexicallyValid = allowedRoots.some(root => {
				const absRoot = pathMod.resolve(root);
				return resolvedCwd === absRoot || resolvedCwd.startsWith(absRoot + pathMod.sep) || resolvedCwd.startsWith(absRoot + '/');
			});
			if (!lexicallyValid) {
				throw new ShellCommandValidationError(`cwd '${args.cwd}' is outside the allowed roots`);
			}
			// …and symlink-aware containment: a cwd that is or contains a symlink
			// pointing outside the roots would escape the sandbox.
			let realCwd: string;
			try {
				realCwd = await fsp.realpath(resolvedCwd);
			} catch {
				realCwd = resolvedCwd; // path may not exist yet; spawn will surface the error
			}
			const reallyValid = allowedRoots.some(root => {
				const absRoot = pathMod.resolve(root);
				let realRoot: string;
				try { realRoot = require('fs').realpathSync(absRoot); } catch { realRoot = absRoot; }
				return realCwd === realRoot || realCwd.startsWith(realRoot + pathMod.sep) || realCwd.startsWith(realRoot + '/');
			});
			if (!reallyValid) {
				throw new ShellCommandValidationError(`cwd '${args.cwd}' resolves outside the allowed roots`);
			}
		}
	}

	const spec = getShellSpec(args.command);
	const timeout = args.timeout ?? 60000;
	return await new Promise((resolve, reject) => {
		const child = spawn(spec.shell, spec.args, { cwd: args.cwd });
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, timeout);
		child.stdout.on('data', (d) => { stdout += d.toString(); });
		child.stderr.on('data', (d) => { stderr += d.toString(); });
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (timedOut) {
				stderr += `\n[shell_exec] Killed after ${timeout}ms timeout.`;
			}
			resolve({ stdout, stderr, exitCode: code });
		});
	});
}
