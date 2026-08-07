import { spawn } from 'child_process';
import { getShellSpec } from '../util/shellCmd';

// Only these commands are permitted — no subshells, no eval, no shell builtins
const ALLOWED_COMMANDS = new Set([
	'bash','sh','zsh','fish',
	'npx','npm','node','pnpm','yarn',
	'cargo','rustc','clippy-driver',
	'git','gh',
	'cat','head','tail','wc','sort','uniq','grep','sed','awk','find','ls','mkdir','cp','mv','rm','touch','chmod','chown','ln',
	'dir','type','echo','printenv','env','which','where','whoami','hostname','date','time',
	'powershell','pwsh','cmd',
]);

export const shellExecDefinition = {
	name: 'shell_exec',
	description: 'Execute a shell command. Uses bash on linux/mac, PowerShell on Windows.',
	inputSchema: {
		type: 'object',
		properties: {
			command: { type: 'string', description: 'Command string to execute.' },
			cwd: { type: 'string', description: 'Working directory (optional).' },
			timeout: { type: 'number', description: 'Timeout in milliseconds (default 60000).', default: 60000 },
		},
		required: ['command'],
	},
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

	// Block all shell metacharacters that enable injection
	if (/[|;&`$()<>{}\[\]!]/.test(trimmed)) {
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

	// Block common env-injection patterns in remaining args
	const argsPart = trimmed.slice(firstToken.length).trim();
	if (/\b(PASSWORD|SECRET|API_KEY|TOKEN|PRIVATE_KEY)=/.test(argsPart)) {
		throw new ShellCommandValidationError('Embedding credential assignments in command args is not allowed');
	}

	// Block path-traversal patterns in args
	if (/[\.\.][\/\\]/.test(argsPart) || /%.*%/.test(argsPart)) {
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
		let resolvedCwd: string;
		try {
			resolvedCwd = require('path').resolve(args.cwd);
		} catch {
			throw new ShellCommandValidationError(`Invalid cwd: ${args.cwd}`);
		}
		const pathMod = await import('path');
		if (allowedRoots && allowedRoots.length > 0) {
			const valid = allowedRoots.some(root => {
				const absRoot = pathMod.resolve(root);
				return resolvedCwd === absRoot || resolvedCwd.startsWith(absRoot + pathMod.sep) || resolvedCwd.startsWith(absRoot + '/');
			});
			if (!valid) {
				throw new ShellCommandValidationError(`cwd '${args.cwd}' is outside the allowed roots`);
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
