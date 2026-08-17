// Unit tests for llama-server argument building.
// buildArgs is the pure core of processManager — these tests pin the
// security-critical behaviors: host binding, flag ordering, tokenization
// of user extraArgs, and dedupe of -fa/-ngl.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildArgs } from '../src/services/processManager';
import { DEFAULT_LAUNCH_PARAMS, EKvQuantType, type ILaunchParams } from '@warpcore/shared';

// Mock the JSON store so importing processManager never touches the
// developer's real warpcore-data.json.
vi.mock('../src/util/store', () => ({
	store: {
		get: vi.fn(),
		put: vi.fn(),
		list: vi.fn(),
		del: vi.fn(),
	},
}));

function makeParams(overrides: Partial<ILaunchParams> = {}): ILaunchParams {
	return { ...DEFAULT_LAUNCH_PARAMS, ...overrides };
}

const indexOfPair = (args: string[], flag: string): number => args.indexOf(flag);

describe('buildArgs host binding', () => {
	it('binds 127.0.0.1 by default (loopback only)', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams(), [], 0);
		const idx = indexOfPair(args, '--host');
		expect(args[idx + 1]).toBe('127.0.0.1');
	});

	it('binds 0.0.0.0 when inferenceExposeExternal is enabled', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({ inferenceExposeExternal: true }), [], 0);
		const idx = indexOfPair(args, '--host');
		expect(args[idx + 1]).toBe('0.0.0.0');
	});
});

describe('buildArgs flag ordering (server-controlled flags win)', () => {
	it('appends --host/--port AFTER user extraArgs so they cannot be overridden', () => {
		const params = makeParams({ port: 8080, extraArgs: '--host 1.2.3.4 --port 9999' });
		const args = buildArgs('/models/m.gguf', null, params, [], 0);
		// The server-controlled --port (8080) must come last and win.
		const lastPort = args.lastIndexOf('--port');
		expect(args[lastPort + 1]).toBe('8080');
		// --host is also appended after the user's attempt.
		const lastHost = args.lastIndexOf('--host');
		expect(args[lastHost + 1]).toBe('127.0.0.1');
		// User flags are still present (llama-server uses the last occurrence).
		expect(args.indexOf('1.2.3.4')).toBeGreaterThan(-1);
		expect(args.indexOf('9999')).toBeGreaterThan(-1);
	});

	it('tokenizes quoted extraArgs via shell-quote', () => {
		const params = makeParams({ extraArgs: '--ctx-size "4 8" --rope-scaling yarn' });
		const args = buildArgs('/models/m.gguf', null, params, [], 0);
		const ctxIdx = args.indexOf('--ctx-size');
		expect(ctxIdx).toBeGreaterThan(-1);
		expect(args[ctxIdx + 1]).toBe('4 8');
		expect(args).toContain('--rope-scaling');
		expect(args).toContain('yarn');
	});

	it('injects --slot-save-path after --port', () => {
		const params = makeParams({ port: 8080 });
		const args = buildArgs('/models/m.gguf', null, params, [], 0, { 'slot-save-path': '/tmp/checkpoints' });
		expect(args[args.length - 2]).toBe('--slot-save-path');
		expect(args[args.length - 1]).toBe('/tmp/checkpoints');
	});
});

describe('buildArgs dedupe and flags', () => {
	it('dedupes -fa from defaultArgs and re-adds it once', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams(), ['-fa', 'on'], 0);
		const faCount = args.filter(a => a === '-fa').length;
		expect(faCount).toBe(1);
		expect(args[args.indexOf('-fa') + 1]).toBe('on');
	});

	it('dedupes -ngl from defaultArgs and applies gpuLayers', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({ gpuLayers: 24 }), ['-ngl', '99'], 0);
		const nglCount = args.filter(a => a === '-ngl').length;
		expect(nglCount).toBe(1);
		expect(args[args.indexOf('-ngl') + 1]).toBe('24');
	});

	it('omits -ngl when gpuLayersAuto is true', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({ gpuLayers: 999, gpuLayersAuto: true }), ['-ngl', '999'], 0);
		expect(args).not.toContain('-ngl');
	});

	it('emits -np and --kv-unified for parallel slots', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({ parallelSlots: 4 }), [], 0);
		expect(args[args.indexOf('-np') + 1]).toBe('4');
		expect(args).toContain('--kv-unified');
	});

	it('builds pre-9100 ngram spec-decode args', () => {
		const args = buildArgs(
			'/models/m.gguf',
			null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'ngram', specType: 'ngram', ngramSizeN: 4, ngramSizeM: 3, ngramMinHits: 2 } }),
			[],
			9000,
		);
		expect(args).toContain('--spec-type');
		expect(args[args.indexOf('--spec-ngram-size-n') + 1]).toBe('4');
	});

	it('uses post-9100 spec args for newer builds', () => {
		const args = buildArgs(
			'/models/m.gguf',
			null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'ngram', specType: 'ngram', ngramSizeN: 4 } }),
			[],
			10000,
		);
		// Post-9100 ngram flags carry a per-family prefix ('simple' for plain ngram).
		expect(args[args.indexOf('--spec-ngram-simple-size-n') + 1]).toBe('4');
		// And must NOT use the pre-9100 unprefixed form.
		expect(args).not.toContain('--spec-ngram-size-n');
	});

	it('emits kv cache types when not F16', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({ kvQuantK: EKvQuantType.Q8_0, kvQuantV: EKvQuantType.Q8_0 }), [], 0);
		expect(args[args.indexOf('--cache-type-k') + 1]).toBe(EKvQuantType.Q8_0);
		expect(args[args.indexOf('--cache-type-v') + 1]).toBe(EKvQuantType.Q8_0);
	});
});
