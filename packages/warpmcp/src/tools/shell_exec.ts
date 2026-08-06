import { spawn } from 'child_process';
import { getShellSpec } from '../util/shellCmd';

// Dangerous patterns that indicate shell injection or destructive commands
const DANGEROUS_PATTERNS = [
	/;\s*(rm|del|format|mkfs|dd|wipe|shred|overwrite)\b/i,
	/\|\s*(rm|del|format|mkfs|dd|wipe|shred|overwrite)\b/i,
	/&&\s*(rm|del|format|mkfs|dd|wipe|shred|overwrite)\b/i,
	/>[\s/]/,
	/>[\s/]*\.(env|bashrc|profile|zshrc|bash_profile)/i,
	/\$\(/,
	/`[^`]*`/,
	/\$\{[^}]*\}/,
	/\|\s*nc\b/i,
	/\|\s*socat\b/i,
	/>[\s/]*\/dev\//i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsudo\b/i,
	/\bchmod\s+[^ ]*777\b/i,
	/\bchown\b/i,
	/\bexport\s/i,
	/\bunset\s/i,
	/\balias\s/i,
	/\btrap\b/i,
	/\beval\b/i,
	/\bexec\b/i,
	/\bsource\b/i,
	/\bapt-get\s+(remove|purge|autoremove)\b/i,
	/\bpacman\s+-[Rr]\b/i,
	/\bdnf\s+(remove|erase)\b/i,
	/\byum\s+remove\b/i,
	/\bchoco\s+uninstall\b/i,
	/\bbrew\s+uninstall\b/i,
	/\bkill\s+-9\b/i,
	/\bsystemctl\s+(stop|disable)\s/i,
	/\biptables\b/i,
	/\bmodprobe\b/i,
	/\binsmod\b/i,
	/\brmmod\b/i,
	/\bgrub\b/i,
	/\bflash\b/i,
	/\bdd\s+if=/i,
	/\bmkfs\b/i,
	/\bformat\b/i,
	/\bshred\b/i,
	/\bwipe\b/i,
	/\bnc\b/i,
	/\bsocat\b/i,
	/\bnetcat\b/i,
	/\bncat\b/i,
	/\bssh\b.*-[LRD]\b/i,
	/\bpython\b.*-c\b/i,
	/\bruby\b.*-e\b/i,
	/\bperl\b.*-e\b/i,
	/\bnode\b.*-e\b/i,
	/\bphp\b.*-r\b/i,
	/\bjulia\b.*-e\b/i,
	/\blua\b/i,
	/\bawk\b.*-f\b/i,
	/\bsed\b.*-f\b/i,
	/\bgrep\b.*-f\b/i,
	/\bfind\b.*-exec\b/i,
	/\bxargs\b/i,
	/\bnohup\b/i,
	/\bbg\b/i,
	/\bfg\b/i,
	/\bdisown\b/i,
	/\bjobs\b/i,
	/\bkill\b/i,
	/\bkillall\b/i,
	/\bpkill\b/i,
	/\bpgrep\b/i,
	/\btop\b/i,
	/\bhtop\b/i,
	/\bfree\b/i,
	/\bdf\b/i,
	/\bdu\b/i,
	/\bmount\b/i,
	/\bumount\b/i,
	/\block\b/i,
	/\bunlock\b/i,
	/\bchroot\b/i,
	/\bnsenter\b/i,
	/\bping\b/i,
	/\btraceroute\b/i,
	/\btracepath\b/i,
	/\bifconfig\b/i,
	/\bip\s+addr\b/i,
	/\bip\s+route\b/i,
	/\bip\s+link\b/i,
	/\bnetstat\b/i,
	/\bsystemctl\b/i,
	/\bjournalctl\b/i,
	/\blogrotate\b/i,
	/\bcron\b/i,
	/\bat\b/i,
	/\bcrontab\b/i,
	/\buseradd\b/i,
	/\buserdel\b/i,
	/\busermod\b/i,
	/\bgroupadd\b/i,
	/\bgroupdel\b/i,
	/\bpasswd\b/i,
	/\bchpasswd\b/i,
	/\bvisudo\b/i,
	/\bsu\b/i,
	/\blogin\b/i,
	/\blogout\b/i,
	/\bexit\b/i,
	/\bhistory\b/i,
	/\balias\b/i,
	/\bunalias\b/i,
	/\bset\b/i,
	/\bunset\b/i,
	/\bexport\b/i,
	/\bdeclare\b/i,
	/\btypeset\b/i,
	/\breadonly\b/i,
	/\blocal\b/i,
	/\bfunction\b/i,
	/\breturn\b/i,
	/\bbreak\b/i,
	/\bcontinue\b/i,
	/\btrap\b/i,
	/\beval\b/i,
	/\bexec\b/i,
	/\bsource\b/i,
	/\b\.\s/i,
	/\b\.\//i,
	/\b\.\.\//i,
	/\b\.\.\\\//i,
	/\b%TEMP%\b/i,
	/\b%TMP%\b/i,
	/\b%APPDATA%\b/i,
	/\b%LOCALAPPDATA%\b/i,
	/\b%PROGRAMFILES%\b/i,
	/\b%PROGRAMDATA%\b/i,
	/\b%SYSTEMROOT%\b/i,
	/\b%WINDIR%\b/i,
	/\b%SYSTEMDRIVE%\b/i,
	/\b%USERPROFILE%\b/i,
	/\b%HOMEPATH%\b/i,
	/\b%HOMEDRIVE%\b/i,
	/\b%PATH%\b/i,
	/\b%SYSTEM32%\b/i,
	/\b%SYSDIR%\b/i,
	/\b%INIFILE%\b/i,
	/\b%COMPUTERNAME%\b/i,
	/\b%USERNAME%\b/i,
	/\b%USERDOMAIN%\b/i,
	/\b%USERDOMAIN_ROAMINGPROFILE%\b/i,
	/\b%PUBLIC%\b/i,
	/\b%ALLUSERSPROFILE%\b/i,
	/\b%COMMONPROGRAMFILES%\b/i,
	/\b%COMMONPROGRAMFILES(X86)%\b/i,
	/\b%COMMONPROGRAMW6432%\b/i,
	/\b%PROGRAMW6432%\b/i,
];

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

export function validateShellCommand(command: string): void {
	if (!command || typeof command !== 'string') {
		throw new ShellCommandValidationError('Command must be a non-empty string');
	}

	const trimmed = command.trim();
	if (trimmed.length === 0) {
		throw new ShellCommandValidationError('Command cannot be empty');
	}

	// Check for dangerous patterns
	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(trimmed)) {
			throw new ShellCommandValidationError(`Command contains dangerous pattern: ${pattern.source}`);
		}
	}

	// Check for command chaining (|, &&, ||, ;)
	if (/[|;&]/.test(trimmed)) {
		throw new ShellCommandValidationError('Command chaining (pipes, semicolons, &&, ||) is not allowed');
	}

	// Check for subshell execution
	if (/\(/.test(trimmed) || /\)/.test(trimmed)) {
		throw new ShellCommandValidationError('Subshell execution is not allowed');
	}

	// Check for file redirection
	if (/[<>]/.test(trimmed)) {
		throw new ShellCommandValidationError('File redirection is not allowed');
	}

	// Check for variable expansion
	if (/\$/.test(trimmed)) {
		throw new ShellCommandValidationError('Variable expansion is not allowed');
	}

	// Check for backticks
	if (/\`/.test(trimmed)) {
		throw new ShellCommandValidationError('Backtick command substitution is not allowed');
	}
}

export async function shellExecHandler(args: { command: string; cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	validateShellCommand(args.command);
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
