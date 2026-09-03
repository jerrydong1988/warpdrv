// Unit tests for whisper-server argument construction and CLI tokenization.
// These pin the security-critical behaviours: the controlled --host/--port flags
// must be appended after user-supplied extraArgs (whisper-server keeps the last
// occurrence of a flag), the listen address must follow the exposure setting
// instead of always binding 0.0.0.0, and glob-shaped tokens must survive
// tokenization instead of being silently dropped.
import { describe, it, expect, vi } from 'vitest';
import { buildWhisperArgs } from '../src/services/whisperProcessManager';
import { parseArgTokens } from '../src/util/shellArgs';
import { DEFAULT_WHISPER_LAUNCH_PARAMS, type IWhisperLaunchParams } from '@warpcore/shared';

// Keep the pure functions importable without touching the real data store.
vi.mock('../src/util/store', () => ({
	store: { get: vi.fn(), put: vi.fn(), list: vi.fn(), del: vi.fn() },
}));
vi.mock('../src/services/sseManagerInstance', () => ({
	sseManager: { emit: vi.fn() },
}));

const makeParams = (overrides: Partial<IWhisperLaunchParams> = {}): IWhisperLaunchParams => ({
	...DEFAULT_WHISPER_LAUNCH_PARAMS,
	port: 8080,
	...overrides,
});

const valuesFor = (args: string[], flag: string): string[] => {
	const out: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === flag) out.push(args[i + 1] ?? '');
	}
	return out;
};

describe('parseArgTokens', () => {
	it('keeps glob tokens instead of dropping them', () => {
		expect(parseArgTokens('--include *.ts --x ?foo')).toEqual(['--include', '*.ts', '--x', '?foo']);
	});

	it('preserves flag/value pairing after a glob token', () => {
		const tokens = parseArgTokens('--filter *.txt --model m1');
		expect(tokens[0]).toBe('--filter');
		expect(tokens[1]).toBe('*.txt');
		expect(tokens[2]).toBe('--model');
		expect(tokens[3]).toBe('m1');
	});

	it('drops shell operators and returns nothing for blank input', () => {
		expect(parseArgTokens('')).toEqual([]);
		expect(parseArgTokens('   ')).toEqual([]);
		expect(parseArgTokens('--a ; rm -rf /')).not.toContain(';');
	});

	it('honours quoting', () => {
		expect(parseArgTokens('--prompt "hello world"')).toEqual(['--prompt', 'hello world']);
	});
});

describe('buildWhisperArgs', () => {
	it('binds loopback by default', () => {
		const args = buildWhisperArgs('/models/model.bin', makeParams({ port: 9100 }), []);
		expect(valuesFor(args, '--host')).toEqual(['127.0.0.1']);
		expect(valuesFor(args, '--port')).toEqual(['9100']);
	});

	it('binds 0.0.0.0 only when inferenceExposeExternal is enabled', () => {
		const args = buildWhisperArgs('/models/model.bin', makeParams({ inferenceExposeExternal: true }), []);
		expect(valuesFor(args, '--host')).toEqual(['0.0.0.0']);
	});

	it('appends --host/--port AFTER user extraArgs so they cannot be overridden', () => {
		const args = buildWhisperArgs(
			'/models/model.bin',
			makeParams({ port: 8080, extraArgs: '--host 1.2.3.4 --port 9999' }),
			[],
		);
		// The user's attempt is present but comes first; the controlled pair wins.
		expect(args).toContain('1.2.3.4');
		expect(args.lastIndexOf('--host')).toBeGreaterThan(args.indexOf('1.2.3.4'));
		expect(valuesFor(args, '--host').at(-1)).toBe('127.0.0.1');
		expect(valuesFor(args, '--port').at(-1)).toBe('8080');
	});

	it('keeps glob-shaped extraArgs tokens and their pairing', () => {
		const args = buildWhisperArgs('/models/model.bin', makeParams({ extraArgs: '--include *.ts' }), []);
		expect(args).toContain('*.ts');
		expect(args[args.indexOf('--include') + 1]).toBe('*.ts');
	});

	it('keeps the model path and default args', () => {
		const args = buildWhisperArgs('/models/model.bin', makeParams(), ['--verbose']);
		expect(args[0]).toBe('--verbose');
		expect(args[args.indexOf('-m') + 1]).toBe('/models/model.bin');
	});
});
