import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { StringDecoder } from 'string_decoder';
import { getShellSpec } from '../util/shellCmd';

// Only these commands are permitted — no shells, no eval-style flags.
// Shells (bash/sh/zsh/fish/powershell/cmd) are deliberately excluded:
// executing the whole command via `-c` would make the allowlist pointless.
//
// `env` and `printenv` were removed from this list: `env <program>` executes any
// binary on PATH, which made the allowlist advisory rather than binding, and
// dumping the process environment hands credentials to whatever the model reads
// next. Runtimes that can execute arbitrary code (node/npm/npx) stay because a
// coding agent cannot build anything without them — they are mitigated by path
// confinement below plus a scrubbed child environment, not by this list.
const ALLOWED_COMMANDS = new Set([
	'npx','npm','node','pnpm','yarn',
	'cargo','rustc','clippy-driver',
	'git','gh',
	'cat','head','tail','wc','sort','uniq','grep','sed','awk','find','ls','mkdir','cp','mv','rm','touch','chmod','chown','ln',
	'dir','type','echo','which','where','whoami','hostname','date','time',
	// Read-only system inspection commands. Pipelines, redirects, subshells and
	// statement separators remain blocked below, so these cannot be chained
	// into mutation commands.
	'top','free','df','du','ps','uptime','vmstat','iostat','lscpu','nproc','vm_stat',
	'systeminfo','tasklist',
	'get-date','get-process','get-ciminstance','get-counter','get-psdrive','get-computerinfo',
	'get-volume','get-nettcpconnection','get-netadapterstatistics',
]);

// Flags that make the (still allowlisted) runtimes evaluate arbitrary code or
// load arbitrary modules. Scoped per command family: `-p` means `--print`
// (evaluate) for node but "package" for `npx -p`, and none of these flags are
// meaningful for cargo/rustc/clippy-driver. The check must apply ONLY to these
// runtimes — applying it to every allowlisted command wrongly rejected plain
// flags like `mkdir -p`, `cp -r`, `rm -r`, `grep -i` or `wc -c`.
const EVAL_FLAGS_BY_COMMAND: Readonly<Record<string, readonly string[]>> = {
	node: ['-e', '--eval', '-p', '--print', '-r', '--require', '--import', '--loader', '-i', '--interactive', '-c', '--check'],
	npx: ['-e', '--eval', '-c', '--shell', '-r', '--require', '--import', '--loader', '-i', '--interactive'],
	npm: ['-c', '--shell'],
	yarn: ['-c', '--shell'],
	pnpm: ['-c', '--shell'],
};

// Cap buffered child output. resultLimit only bounds the tool *result*; without
// a cap here, `cat huge-file` could exhaust the process heap while streaming.
const MAX_STREAM_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 300000;

// Absolute-path shapes found anywhere in the argument string. Lookbehinds keep
// URLs (https://…) and relative paths (./src) from being mistaken for them.
const ABSOLUTE_PATH_PATTERNS: RegExp[] = [
	/(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s]*/g,          // C:\dir  D:/dir
	/\\\\[^\s]+/g,                              // \\server\share
	/(?<![A-Za-z0-9.:\-/:~%])\/[A-Za-z0-9._][^\s]*/g, // /etc/passwd, --file=/tmp/x
];

export const shellExecDefinition = {
	name: 'shell_exec',
	description: 'Execute one allowlisted command. Uses bash on Linux/macOS and PowerShell on Windows. For Windows resource inspection, use commands such as Get-Process, Get-CimInstance, Get-Counter and Get-PSDrive; for Linux/macOS, use commands such as top, free, df, ps and uptime. Pipelines, redirects, command chaining and shell interpreters are rejected. Every absolute path argument must resolve inside fsAllowedRoots. Note that allowlisted runtimes (node, npm, npx, cargo) can run project code; the child process runs with a scrubbed environment (no credentials).',
	inputSchema: {
		type: 'object',
		properties: {
			command: { type: 'string', description: 'One allowlisted command with arguments. On Windows, prefer PowerShell-native read-only inspection commands instead of Unix commands.' },
			cwd: { type: 'string', description: 'Working directory (optional).' },
			timeout: { type: 'number', description: 'Timeout in milliseconds (default and maximum 300000).', default: MAX_TIMEOUT_MS },
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
	const last = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'));
	return last >= 0 ? token.slice(last + 1).toLowerCase() : token.toLowerCase();
}

/** Absolute-path arguments must stay inside the allowed roots. */
function assertArgPathsInsideRoots(argsPart: string, allowedRoots: string[], cwd: string | undefined): void {
	if (allowedRoots.length === 0) return;
	const base = cwd ? path.resolve(cwd) : process.cwd();
	for (const pattern of ABSOLUTE_PATH_PATTERNS) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(argsPart)) !== null) {
			const raw = match[0].replace(/["'",)]+$/, '');
			if (raw.length === 0) continue;
			let resolved: string;
			try {
				resolved = path.resolve(base, raw);
			} catch {
				throw new ShellCommandValidationError(`Argument '${raw}' is not a usable path`);
			}
			const inside = allowedRoots.some(root => {
				const absRoot = path.resolve(root);
				let realRoot: string;
				try { realRoot = fs.realpathSync(absRoot); } catch { realRoot = absRoot; }
				let realTarget: string;
				try { realTarget = fs.realpathSync(resolved); } catch { realTarget = resolved; }
				const rel = path.relative(realRoot, realTarget);
				return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
			});
			if (!inside) {
				throw new ShellCommandValidationError(
					`Argument '${raw}' resolves outside the allowed roots; pass a path inside fsAllowedRoots or set cwd`,
				);
			}
		}
	}
}

export function validateShellCommand(command: string, allowedRoots?: string[], cwd?: string): void {
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
	if (
		Array.from(command).some((char) => {
			const code = char.charCodeAt(0);
			return code <= 0x1f || code === 0x7f;
		})
	) {
		throw new ShellCommandValidationError('Control characters (newlines, tabs, etc.) are not allowed');
	}

	// Block all shell metacharacters that enable injection
	// Note: `||` must be checked before single `|`; path traversal with encoded dots also blocked
	if (Array.from('|;&`$()<>{}[]!').some((char) => trimmed.includes(char))) {
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

	// Block eval-style flags on the runtimes that can act on them (node -e,
	// node -r x.js, npx -c '…', …). Other allowlisted commands keep their own
	// legitimate flags (`mkdir -p`, `grep -i`, `cp -r`, `cargo build -r`).
	const argsPart = trimmed.slice(firstToken.length).trim();
	const evalFlags = EVAL_FLAGS_BY_COMMAND[base];
	if (evalFlags && evalFlags.length > 0) {
		const flagMatch = argsPart.match(/-{1,2}[a-zA-Z]+/g);
		const blockedFlag = flagMatch?.find(f => evalFlags.includes(f.toLowerCase()));
		if (blockedFlag) {
			throw new ShellCommandValidationError(`Flag '${blockedFlag}' is not allowed (would evaluate arbitrary code)`);
		}
	}

	// Block common env-injection patterns in remaining args
	if (/\b(PASSWORD|SECRET|API_KEY|TOKEN|PRIVATE_KEY)=/.test(argsPart)) {
		throw new ShellCommandValidationError('Embedding credential assignments in command args is not allowed');
	}

	// Block parent-directory traversal (`../`) and env-variable references.
	// `./x` and `a..b` are legitimate and must keep working.
	if (/(^|[\s"'=])\.\.([/\\]|$)/.test(argsPart) || /%[^%]*%/.test(argsPart)) {
		throw new ShellCommandValidationError('Path traversal or env-variable references in arguments are not allowed');
	}

	// Absolute paths are only useful if they stay inside the sandbox.
	if (allowedRoots && allowedRoots.length > 0) {
		assertArgPathsInsideRoots(argsPart, allowedRoots, cwd);
	}
}

/**
 * Environment for the child process: enough to run node/npm/git/cargo, minus
 * anything that looks like a credential. Allowlisted runtimes can execute
 * project code, so the child must not inherit API keys or tokens.
 */
const ENV_ALLOWLIST = new Set([
	// Locating the runtime and the user profile.
	'PATH', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'USERPROFILE', 'USER', 'USERNAME', 'USERDOMAIN', 'LOGNAME',
	// Terminal/locale behaviour.
	'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TMP', 'TEMP',
	// Windows process-launch prerequisites.
	'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'PATHEXT',
	// Tool caches / package-manager homes.
	'APPDATA', 'LOCALAPPDATA', 'NPM_CONFIG_PREFIX', 'COREPACK_HOME', 'CARGO_HOME',
	'RUSTUP_HOME', 'PNPM_HOME', 'YARN_CACHE_FOLDER', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME',
]);

export function buildChildEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) continue;
		if (!ENV_ALLOWLIST.has(key.toUpperCase())) continue;
		out[key] = value;
	}
	// The child is non-interactive: never let git or npm block on a prompt.
	out.GIT_TERMINAL_PROMPT = '0';
	out.CI = 'true';
	return out;
}

export async function shellExecHandler(
	args: { command: string; cwd?: string; timeout?: number },
	allowedRoots?: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	const roots = allowedRoots ?? [];
	validateShellCommand(args.command, roots, args.cwd);

	// Restrict working directory to configured allowed roots
	if (args.cwd) {
		let resolvedCwd: string;
		try {
			resolvedCwd = path.resolve(args.cwd);
		} catch {
			throw new ShellCommandValidationError(`Invalid cwd: ${args.cwd}`);
		}
		if (roots.length > 0) {
			// Lexical containment (both separator styles)…
			const lexicallyValid = roots.some(root => {
				const absRoot = path.resolve(root);
				return resolvedCwd === absRoot || resolvedCwd.startsWith(absRoot + path.sep) || resolvedCwd.startsWith(absRoot + '/');
			});
			if (!lexicallyValid) {
				throw new ShellCommandValidationError(`cwd '${args.cwd}' is outside the allowed roots`);
			}
			// …and symlink-aware containment: a cwd that is or contains a symlink
			// pointing outside the roots would escape the sandbox.
			let realCwd: string;
			try {
				realCwd = await fs.promises.realpath(resolvedCwd);
			} catch {
				realCwd = resolvedCwd; // path may not exist yet; spawn will surface the error
			}
			const reallyValid = roots.some(root => {
				const absRoot = path.resolve(root);
				let realRoot: string;
				try { realRoot = fs.realpathSync(absRoot); } catch { realRoot = absRoot; }
				return realCwd === realRoot || realCwd.startsWith(realRoot + path.sep) || realCwd.startsWith(realRoot + '/');
			});
			if (!reallyValid) {
				throw new ShellCommandValidationError(`cwd '${args.cwd}' resolves outside the allowed roots`);
			}
		}
	}

	const spec = getShellSpec(args.command);
	const timeout = Math.max(1000, Math.min(args.timeout ?? MAX_TIMEOUT_MS, MAX_TIMEOUT_MS));
	return await new Promise((resolve, reject) => {
		// POSIX: put the child in its own process group so a timeout can kill
		// the whole tree (npm spawns grandchildren that would otherwise keep
		// running and holding files/ports). Windows uses taskkill /T instead.
		const child = spawn(spec.shell, spec.args, {
			cwd: args.cwd,
			env: buildChildEnv(process.env),
			detached: process.platform !== 'win32',
		});
		let stdout = '';
		let stderr = '';
		let outTruncated = false;
		let timedOut = false;

		// Decode each stream with a stateful decoder so multi-byte UTF-8
		// characters split across TCP-sized reads survive intact, and cap the
		// buffered size so `cat huge-file` cannot exhaust memory.
		const outDecoder = new StringDecoder('utf8');
		const errDecoder = new StringDecoder('utf8');
		let outBytes = 0;
		let errBytes = 0;

		const timer = setTimeout(() => {
			timedOut = true;
			killTree(child);
		}, timeout);

		child.stdout.on('data', (d: Buffer) => {
			if (outBytes >= MAX_STREAM_BYTES) { outTruncated = true; return; }
			outBytes += d.length;
			stdout += outDecoder.write(d);
		});
		child.stderr.on('data', (d: Buffer) => {
			if (errBytes >= MAX_STREAM_BYTES) { outTruncated = true; return; }
			errBytes += d.length;
			stderr += errDecoder.write(d);
		});
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (timedOut) {
				stderr += `\n[shell_exec] Killed after ${timeout}ms timeout.`;
			}
			if (outTruncated) {
				stderr += `\n[shell_exec] Output truncated at ${MAX_STREAM_BYTES} bytes.`;
			}
			resolve({ stdout, stderr, exitCode: code });
		});
	});
}

/** Terminate the child and everything it spawned. */
function killTree(child: { pid?: number; kill: (signal?: NodeJS.Signals) => boolean }): void {
	const pid = child.pid;
	if (pid === undefined) return;
	if (process.platform === 'win32') {
		try {
			spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
			return;
		} catch { /* fall through to plain kill */ }
	} else {
		try {
			process.kill(-pid, 'SIGKILL'); // negative pid = process group
			return;
		} catch { /* group may already be gone */ }
	}
	try { child.kill('SIGKILL'); } catch { /* already exited */ }
}
