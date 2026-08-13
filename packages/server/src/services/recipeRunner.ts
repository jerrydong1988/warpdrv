import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import os from 'os';
import { resolveBashPath } from '../util/shellResolver';
import {
	ERecipeStepStatus,
	ERecipeRunStatus,
	ERecipeStreamKind,
	type IRecipeParsed,
	type IRecipeRunState,
	type IRecipeStepState,
	type TRecipeInputValues,
	type TRunId,
	type TRecipeId,
	type TStepId,
} from '@warpcore/shared';

function expandHome(p: string | undefined): string | undefined {
	if (p === undefined) return undefined;
	let out = p;
	if (out === '~') return os.homedir();
	if (out.startsWith('~/')) out = os.homedir() + out.slice(1);
	out = out.replace(/\$HOME/g, os.homedir());
	return out;
}

// Validate recipe step body to prevent shell injection
const SAFE_COMMAND_PATTERN = /^[a-zA-Z0-9_./-]+(\s+[a-zA-Z0-9_./-]+)*$/;
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

export function validateRecipeBody(body: string): void {
	if (!body || typeof body !== 'string') {
		throw new Error('Recipe step body must be a non-empty string');
	}

	const trimmed = body.trim();
	if (trimmed.length === 0) {
		throw new Error('Recipe step body cannot be empty');
	}

	if (/[|;&]/.test(trimmed)) {
		throw new Error('Recipe steps cannot contain command chaining (pipes, semicolons, &&, ||)');
	}

	if (/\(/.test(trimmed) || /\)/.test(trimmed)) {
		throw new Error('Recipe steps cannot contain subshell execution');
	}

	if (/[<>]/.test(trimmed)) {
		throw new Error('Recipe steps cannot contain file redirection');
	}

	if (/\$/.test(trimmed)) {
		throw new Error('Recipe steps cannot contain variable expansion');
	}

	if (/\`/.test(trimmed)) {
		throw new Error('Recipe steps cannot contain backtick command substitution');
	}

	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(trimmed)) {
			throw new Error(`Recipe step contains dangerous pattern: ${pattern.source}`);
		}
	}
}

interface ISSEEmitter {
	emit(channel: string, data: unknown): void;
}

interface IActiveRun {
	state: IRecipeRunState;
	proc: ChildProcess | null;
	cancelled: boolean;
}

let activeRun: IActiveRun | null = null;
let sseEmitter: ISSEEmitter | null = null;
let runLock = false;

export function setRecipeRunnerSSE(emitter: ISSEEmitter): void {
	sseEmitter = emitter;
}

export function isRunInProgress(): boolean {
	return activeRun !== null;
}

export function getActiveRun(): IRecipeRunState | null {
	return activeRun ? activeRun.state : null;
}

export async function startRun(
	recipeId: TRecipeId,
	parsed: IRecipeParsed,
	inputs: TRecipeInputValues,
): Promise<TRunId> {
	if (activeRun !== null) throw new Error('A recipe run is already in progress');
	if (sseEmitter === null) throw new Error('Recipe runner SSE emitter not initialized');
	if (runLock) throw new Error('A recipe run is already in progress');

	runLock = true;

	const runId = randomUUID();
	const startedAt = Date.now();

	const stepStates: IRecipeStepState[] = parsed.steps.map(s => ({
		id: s.id,
		name: s.name,
		status: ERecipeStepStatus.PENDING,
	}));

	const state: IRecipeRunState = {
		runId,
		recipeId,
		status: ERecipeRunStatus.RUNNING,
		inputs,
		steps: stepStates,
		startedAt,
	};

	activeRun = { state, proc: null, cancelled: false };
	sseEmitter.emit('runs:started', state);

	executeRun(parsed).then(() => {}).catch(err => {
		console.error('[recipeRunner] unhandled error in executeRun:', err);
		if (activeRun !== null && activeRun.state.runId === runId) {
			activeRun.state.status = ERecipeRunStatus.FAILED;
			activeRun.state.finishedAt = Date.now();
			sseEmitter?.emit('runs:finished', {
				runId: activeRun.state.runId,
				status: ERecipeRunStatus.FAILED,
				finishedAt: activeRun.state.finishedAt,
			});
			activeRun = null;
			runLock = false;
		}
	});

	return runId;
}

export function cancelRun(): boolean {
	if (activeRun === null) return false;
	activeRun.cancelled = true;
	if (activeRun.proc !== null) {
		try {
			const proc = activeRun.proc;
			const pid = proc.pid;
			activeRun.proc = null;
			if (pid !== undefined && process.platform !== 'win32') {
				// Use pid directly — negative pid kills the entire process group, which may
				// inadvertently kill unrelated children of the same PID
				process.kill(pid, 'SIGKILL');
			} else if (pid !== undefined) {
				spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
			}
		}
		catch (err) { console.error('[recipeRunner] failed to kill:', err); }
	}
	return true;
}

async function executeRun(parsed: IRecipeParsed): Promise<void> {
	if (activeRun === null || sseEmitter === null) return;

	const env: Record<string, string> = sanitizeEnv(process.env);
	const controlPort = process.env.CONTROL_API_PORT;
	if (controlPort !== undefined) env.CONTROL_API_PORT = controlPort;

	const safeInputs = sanitizeRecipeInputs(activeRun.state.inputs);
	for (const [name, value] of Object.entries(safeInputs)) {
		env[name] = value;
	}

	let runStatus: ERecipeRunStatus = ERecipeRunStatus.OK;

	for (let i = 0; i < parsed.steps.length; i++) {
		if (activeRun === null) return;
		if (activeRun.cancelled) { runStatus = ERecipeRunStatus.CANCELLED; break; }

		const stepDef = parsed.steps[i]!;
		const stepState = activeRun.state.steps[i]!;
		const startedAt = Date.now();

		stepState.status = ERecipeStepStatus.RUNNING;
		stepState.startedAt = startedAt;

		sseEmitter.emit('runs:step-started', {
			runId: activeRun.state.runId,
			stepId: stepDef.id,
			startedAt,
		});

		validateRecipeBody(stepDef.body);

		const result = await runStep(stepDef.body, stepDef.cwd, env, stepDef.id, activeRun.state.runId);

		const finishedAt = Date.now();
		stepState.finishedAt = finishedAt;
		stepState.exitCode = result.exitCode;

		let stepFinalStatus: ERecipeStepStatus;
		if (result.cancelled) stepFinalStatus = ERecipeStepStatus.CANCELLED;
		else if (result.exitCode === 0) stepFinalStatus = ERecipeStepStatus.OK;
		else stepFinalStatus = ERecipeStepStatus.FAILED;

		stepState.status = stepFinalStatus;

		sseEmitter.emit('runs:step-finished', {
			runId: activeRun.state.runId,
			stepId: stepDef.id,
			status: stepFinalStatus,
			exitCode: result.exitCode,
			finishedAt,
		});

		if (stepFinalStatus === ERecipeStepStatus.CANCELLED) { runStatus = ERecipeRunStatus.CANCELLED; break; }
		if (stepFinalStatus === ERecipeStepStatus.FAILED) { runStatus = ERecipeRunStatus.FAILED; break; }
	}

	if (activeRun === null) return;

	const finishedAt = Date.now();
	activeRun.state.status = runStatus;
	activeRun.state.finishedAt = finishedAt;

	sseEmitter.emit('runs:finished', {
		runId: activeRun.state.runId,
		status: runStatus,
		finishedAt,
	});

	activeRun = null;
	runLock = false;
}

interface IStepResult {
	exitCode: number;
	cancelled: boolean;
}

function runStep(
	body: string,
	cwd: string | undefined,
	env: Record<string, string>,
	stepId: TStepId,
	runId: TRunId,
): Promise<IStepResult> {
	return new Promise<IStepResult>((resolve) => {
		let proc: ChildProcess;
		try {
			proc = spawn(resolveBashPath(), ['-c', body], {
				cwd: expandHome(cwd) ?? process.cwd(),
				env,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		}
		catch (err) {
			sseEmitter?.emit('runs:step-output', {
				runId,
				stepId,
				kind: ERecipeStreamKind.STDERR,
				data: `[runner] ${err instanceof Error ? err.message : String(err)}\n`,
			});
			resolve({ exitCode: 1, cancelled: false });
			return;
		}
		if (activeRun !== null) activeRun.proc = proc;

		proc.stdout?.on('data', (chunk: Buffer) => {
			sseEmitter?.emit('runs:step-output', {
				runId,
				stepId,
				kind: ERecipeStreamKind.STDOUT,
				data: chunk.toString('utf8'),
			});
		});

		proc.stderr?.on('data', (chunk: Buffer) => {
			sseEmitter?.emit('runs:step-output', {
				runId,
				stepId,
				kind: ERecipeStreamKind.STDERR,
				data: chunk.toString('utf8'),
			});
		});

		proc.on('error', (err) => {
			sseEmitter?.emit('runs:step-output', {
				runId,
				stepId,
				kind: ERecipeStreamKind.STDERR,
				data: `[runner] failed to spawn: ${err.message}\n`,
			});
			// Resolve the promise so the step doesn't hang forever
			if (activeRun !== null) activeRun.proc = null;
			resolve({ exitCode: 1, cancelled: false });
		});

		proc.on('exit', (code, signal) => {
			if (activeRun !== null) activeRun.proc = null;
			const cancelled = activeRun !== null && activeRun.cancelled;
			const exitCode = code !== null ? code : (signal !== null ? 1 : 1);
			resolve({ exitCode, cancelled });
		});
	});
}

function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(env)) {
		if (v !== undefined) out[k] = v;
	}
	return out;
}

const SAFE_INPUT_KEY_RE = /^[A-Z_][A-Z0-9_]{0,127}$/i;
const DANGEROUS_ENV_KEYS = new Set([
	'PATH','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','NODE_PATH',
	'HOME','USER','LOGNAME','SHELL','TMP','TEMP','TMPDIR',
	'DISPLAY','XAUTHORITY',
	'USERPROFILE','APPDATA','LOCALAPPDATA',
	'HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy',
	'AGENT_NAME','AGENT_TOKEN','GITHUB_TOKEN','API_KEY','SECRET','PASSWORD',
]);

function sanitizeRecipeInputs(inputs: TRecipeInputValues): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(inputs)) {
		if (!SAFE_INPUT_KEY_RE.test(name)) continue;
		if (DANGEROUS_ENV_KEYS.has(name.toUpperCase())) continue;
		const strVal = String(value);
		if (strVal.length > 4096) continue;
		out[name] = strVal;
	}
	return out;
}
