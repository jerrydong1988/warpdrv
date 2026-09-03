// Unit tests for llama-server argument building.
// buildArgs is the pure core of processManager — these tests pin the
// security-critical behaviors: host binding, flag ordering, tokenization
// of user extraArgs, and dedupe of -fa/-ngl.
import { describe, it, expect, vi, } from 'vitest';
import { buildArgs } from '../src/services/processManager';
import {
	DEFAULT_LAUNCH_PARAMS,
	EKvQuantType,
	ELlamaFlashAttentionMode,
	ELlamaLoadMode,
	ESpecType,
	parseDefaultArgsToParams,
	type ILaunchParams,
	type ILlamaBackendCapabilities,
} from '@warpcore/shared';

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

const B10453_CAPABILITIES: ILlamaBackendCapabilities = {
	schemaVersion: 1,
	probedAt: 0,
	supportedFlags: [
		'-fa', '--load-mode', '--spec-type', '--spec-draft-model', '--spec-draft-device', '--spec-draft-ngl',
		'--spec-draft-n-max', '--spec-draft-n-min', '--spec-draft-p-min',
		'--spec-ngram-mod-n-max', '--spec-ngram-mod-n-min', '--spec-ngram-mod-n-match',
		'--spec-ngram-simple-size-n', '--spec-ngram-simple-size-m', '--spec-ngram-simple-min-hits',
		'--spec-ngram-map-k-size-n', '--spec-ngram-map-k-size-m', '--spec-ngram-map-k-min-hits',
		'--spec-ngram-map-k4v-size-n', '--spec-ngram-map-k4v-size-m', '--spec-ngram-map-k4v-min-hits',
	],
	deprecatedFlags: ['--mlock', '--mmap', '--no-mmap', '-dio'],
	removedFlags: ['--draft', '--draft-n', '--draft-max', '--draft-min', '--draft-n-min', '--spec-ngram-size-n', '--spec-ngram-size-m', '--spec-ngram-min-hits'],
	flashAttentionModes: Object.values(ELlamaFlashAttentionMode),
	loadModes: Object.values(ELlamaLoadMode),
	specTypes: ['none', 'draft-simple', 'draft-eagle3', 'draft-mtp', 'draft-dflash', 'draft-dspark', 'ngram-simple', 'ngram-map-k', 'ngram-map-k4v', 'ngram-mod', 'ngram-cache'],
};

describe('backend default argument migration', () => {
	it('parses current flash-attention values without treating off as enabled', () => {
		expect(parseDefaultArgsToParams(['-fa', 'off'])).toMatchObject({ flashAttnMode: ELlamaFlashAttentionMode.OFF, flashAttn: false });
		expect(parseDefaultArgsToParams(['--flash-attn=auto'])).toMatchObject({ flashAttnMode: ELlamaFlashAttentionMode.AUTO, flashAttn: true });
		expect(parseDefaultArgsToParams(['-fa', '--no-warmup'])).toMatchObject({ flashAttnMode: ELlamaFlashAttentionMode.ON, flashAttn: true });
	});

	it('parses explicit modern load modes', () => {
		expect(parseDefaultArgsToParams(['--load-mode', 'dio']).loadMode).toBe(ELlamaLoadMode.DIO);
		expect(parseDefaultArgsToParams(['-lm=mmap+mlock']).loadMode).toBe(ELlamaLoadMode.MMAP_MLOCK);
	});

	it('translates legacy loader flag combinations without changing their behavior', () => {
		expect(parseDefaultArgsToParams(['--no-mmap']).loadMode).toBe(ELlamaLoadMode.NONE);
		expect(parseDefaultArgsToParams(['--no-mmap', '--mlock']).loadMode).toBe(ELlamaLoadMode.MLOCK);
		expect(parseDefaultArgsToParams(['--mlock']).loadMode).toBe(ELlamaLoadMode.MMAP_MLOCK);
	});
});

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
		const args = buildArgs('/models/m.gguf', null, params, [], 0, undefined, { 'slot-save-path': '/tmp/checkpoints' });
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

	it('emits the current flash-attention value and forces on for block drafting', () => {
		const autoArgs = buildArgs(
			'/models/m.gguf', null,
			makeParams({ flashAttnMode: ELlamaFlashAttentionMode.AUTO }),
			[], 10453, B10453_CAPABILITIES,
		);
		const dflashArgs = buildArgs(
			'/models/m.gguf', null,
			makeParams({
				flashAttn: false,
				flashAttnMode: ELlamaFlashAttentionMode.OFF,
				specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'dflash' },
			}),
			[], 10453, B10453_CAPABILITIES,
		);
		expect(autoArgs[autoArgs.indexOf('-fa') + 1]).toBe('auto');
		expect(dflashArgs[dflashArgs.indexOf('-fa') + 1]).toBe('on');
	});

	it('dedupes -ngl from defaultArgs and applies gpuLayers', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({ gpuLayers: 24 }), ['-ngl', '99'], 0);
		const nglCount = args.filter(a => a === '-ngl').length;
		expect(nglCount).toBe(1);
		expect(args[args.indexOf('-ngl') + 1]).toBe('24');
	});

	it('does not swallow the flag after a malformed -ngl without a value', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({ gpuLayers: 24 }), ['-ngl', '--threads', '8'], 0);
		expect(args).toContain('--threads');
		expect(args[args.indexOf('--threads') + 1]).toBe('8');
	});

	it('omits -ngl when gpuLayersAuto is true', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({ gpuLayers: 999, gpuLayersAuto: true }), ['-ngl', '999'], 0);
		expect(args).not.toContain('-ngl');
	});

	it('emits -np and only enables unified KV when requested', () => {
		const splitArgs = buildArgs('/models/m.gguf', null, makeParams({ parallelSlots: 4 }), [], 0);
		expect(splitArgs[splitArgs.indexOf('-np') + 1]).toBe('4');
		expect(splitArgs).not.toContain('--kv-unified');

		const unifiedArgs = buildArgs('/models/m.gguf', null, makeParams({ parallelSlots: 4, kvUnified: true }), [], 0);
		expect(unifiedArgs).toContain('--kv-unified');
	});

	it('builds pre-9100 ngram spec-decode args', () => {
		const args = buildArgs(
			'/models/m.gguf',
			null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'ngram', specType: ESpecType.NGRAM_SIMPLE, ngramSizeN: 4, ngramSizeM: 3, ngramMinHits: 2 } }),
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
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'ngram', specType: ESpecType.NGRAM_SIMPLE, ngramSizeN: 4 } }),
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

	it('normalizes deprecated loader defaults to one b10453 --load-mode without dropping adjacent flags', () => {
		const params = makeParams({
			loadMode: ELlamaLoadMode.NONE,
			noWarmup: true,
			jinja: true,
			swaFull: true,
		});
		const args = buildArgs(
			'/models/m.gguf',
			null,
			params,
			['-ngl', '999', '-fa', '--no-warmup', '--jinja', '--swa-full', '--no-mmap'],
			0,
			B10453_CAPABILITIES,
		);

		expect(args[args.indexOf('--load-mode') + 1]).toBe('none');
		expect(args).not.toContain('--no-mmap');
		expect(args).not.toContain('--mlock');
		expect(args).not.toContain('-dio');
		expect(args).toContain('--no-warmup');
		expect(args).toContain('--jinja');
		expect(args).toContain('--swa-full');
		expect(args[args.indexOf('-fa') + 1]).toBe('on');
	});

	it('removes controlled legacy flags from stored free-form arguments on current backends', () => {
		const args = buildArgs(
			'/models/m.gguf', null,
			makeParams({ extraArgs: '--draft-max 8 --no-mmap --threads 4' }),
			[], 10453, B10453_CAPABILITIES,
		);
		expect(args).not.toContain('--draft-max');
		expect(args).not.toContain('--no-mmap');
		expect(args[args.indexOf('--threads') + 1]).toBe('4');
	});

	it('uses current MTP flags even when a previously unparsed build number is zero', () => {
		const args = buildArgs(
			'/models/m.gguf',
			null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'mtp', specDraftNMax: 3 } }),
			[],
			0,
			B10453_CAPABILITIES,
		);
		expect(args[args.indexOf('--spec-draft-n-max') + 1]).toBe('3');
		expect(args).not.toContain('--draft-max');
		expect(args).not.toContain('--draft-min');
	});

	it('maps ngram-mod controls to the mod n-match/min/max family', () => {
		const args = buildArgs(
			'/models/m.gguf',
			null,
			makeParams({ specDecode: {
				...DEFAULT_LAUNCH_PARAMS.specDecode,
				enabled: true,
				mode: 'ngram',
				specType: ESpecType.NGRAM_MOD,
				ngramSizeN: 24,
				draftMin: 48,
				draftMax: 64,
			} }),
			[],
			10453,
			B10453_CAPABILITIES,
		);
		expect(args[args.indexOf('--spec-ngram-mod-n-match') + 1]).toBe('24');
		expect(args[args.indexOf('--spec-ngram-mod-n-min') + 1]).toBe('48');
		expect(args[args.indexOf('--spec-ngram-mod-n-max') + 1]).toBe('64');
		expect(args).not.toContain('--spec-ngram-mod-size-n');
		expect(args).not.toContain('--spec-draft-n-max');
	});

	it('does not attach unrelated size or draft flags to ngram-cache', () => {
		const args = buildArgs(
			'/models/m.gguf',
			null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'ngram', specType: ESpecType.NGRAM_CACHE } }),
			[],
			10453,
			B10453_CAPABILITIES,
		);
		expect(args[args.indexOf('--spec-type') + 1]).toBe('ngram-cache');
		expect(args.some(arg => arg.startsWith('--spec-ngram-'))).toBe(false);
		expect(args).not.toContain('--spec-draft-n-max');
	});

	it('uses canonical draft-model flags and omits the removed draft context option', () => {
		const args = buildArgs(
			'/models/m.gguf',
			null,
			makeParams({ specDecode: {
				...DEFAULT_LAUNCH_PARAMS.specDecode,
				enabled: true,
				mode: 'draft',
				draftModelPath: '/models/draft.gguf',
				draftContextSize: 4096,
			} }),
			[],
			10453,
			B10453_CAPABILITIES,
		);
		expect(args[args.indexOf('--spec-type') + 1]).toBe('draft-simple');
		expect(args[args.indexOf('--spec-draft-model') + 1]).toBe('/models/draft.gguf');
		expect(args).toContain('--spec-draft-ngl');
		expect(args).not.toContain('--ctx-size-draft');
		expect(args).not.toContain('--model-draft');
	});

	it('normalizes stale speculative types when users switch mode families', () => {
		const ngramArgs = buildArgs(
			'/models/m.gguf', null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'ngram', specType: ESpecType.DFLASH } }),
			[], 10453, B10453_CAPABILITIES,
		);
		const dflashArgs = buildArgs(
			'/models/m.gguf', null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'dflash', specType: ESpecType.NGRAM_MOD } }),
			[], 10453, B10453_CAPABILITIES,
		);
		expect(ngramArgs[ngramArgs.indexOf('--spec-type') + 1]).toBe('ngram-simple');
		expect(dflashArgs[dflashArgs.indexOf('--spec-type') + 1]).toBe('draft-dflash');
	});

	it('supports the b10453 Eagle3 and DSpark draft implementations', () => {
		const eagleArgs = buildArgs(
			'/models/m.gguf', null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'draft', specType: ESpecType.DRAFT_EAGLE3 } }),
			[], 10453, B10453_CAPABILITIES,
		);
		const dsparkArgs = buildArgs(
			'/models/m.gguf', null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'dflash', specType: ESpecType.DRAFT_DSPARK } }),
			[], 10453, B10453_CAPABILITIES,
		);
		expect(eagleArgs[eagleArgs.indexOf('--spec-type') + 1]).toBe('draft-eagle3');
		expect(dsparkArgs[dsparkArgs.indexOf('--spec-type') + 1]).toBe('draft-dspark');
	});

	it('falls back when an older capable backend does not accept a newly selected spec value', () => {
		const capabilities = {
			...B10453_CAPABILITIES,
			specTypes: B10453_CAPABILITIES.specTypes.filter(type => type !== 'draft-dspark'),
		};
		const args = buildArgs(
			'/models/m.gguf', null,
			makeParams({ specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, enabled: true, mode: 'dflash', specType: ESpecType.DRAFT_DSPARK } }),
			[], 10453, capabilities,
		);
		expect(args[args.indexOf('--spec-type') + 1]).toBe('draft-dflash');
	});
});

// llama.cpp v0.3.0 alignment: draft KV quantization, draft execution
// controls, lookup caches, sampling backend, reasoning preserve, slot
// similarity, LoRA and mmproj loading controls.
const V030_CAPABILITIES: ILlamaBackendCapabilities = {
	...B10453_CAPABILITIES,
	supportedFlags: [
		...B10453_CAPABILITIES.supportedFlags,
		'--cache-type-k-draft', '--cache-type-v-draft',
		'--spec-draft-threads', '--spec-draft-threads-batch',
		'--spec-draft-poll', '--spec-draft-poll-batch',
		'--spec-draft-prio', '--spec-draft-prio-batch',
		'--spec-draft-cpu-moe', '--spec-draft-ncmoe',
		'--spec-draft-cpu-mask', '--spec-draft-cpu-mask-batch',
		'--spec-draft-cpu-strict', '--spec-draft-cpu-strict-batch', '--spec-draft-cpu-range',
		'--lookup-cache-static', '--lookup-cache-dynamic',
		'--backend-sampling', '--reasoning-preserve', '--no-reasoning-preserve',
		'--slot-prompt-similarity', '--cache-ram', '--ctx-checkpoints',
		'--lora', '--lora-scaled', '--lora-init-without-apply',
		'--mmproj-url', '--mmproj-auto', '--no-mmproj-auto', '--mmproj-device',
		'--mmproj-offload', '--no-mmproj-offload',
	],
};

const draftSpec = (overrides: Partial<typeof DEFAULT_LAUNCH_PARAMS.specDecode> = {}) => ({
	...DEFAULT_LAUNCH_PARAMS.specDecode,
	enabled: true,
	mode: 'draft' as const,
	draftModelPath: '/models/draft.gguf',
	...overrides,
});

describe('v0.3.0 parameter alignment', () => {
	it('emits draft KV cache quantization only when non-F16 and a draft model exists', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({
			specDecode: draftSpec({ draftKvQuantK: EKvQuantType.Q8_0, draftKvQuantV: EKvQuantType.Q5_0 }),
		}), [], 10453, V030_CAPABILITIES);
		expect(args[args.indexOf('--cache-type-k-draft') + 1]).toBe('q8_0');
		expect(args[args.indexOf('--cache-type-v-draft') + 1]).toBe('q5_0');

		const f16Args = buildArgs('/models/m.gguf', null, makeParams({
			specDecode: draftSpec({ draftKvQuantK: EKvQuantType.F16 }),
		}), [], 10453, V030_CAPABILITIES);
		expect(f16Args).not.toContain('--cache-type-k-draft');

		// ngram has no draft model — never emit draft-only controls
		const ngramArgs = buildArgs('/models/m.gguf', null, makeParams({
			specDecode: draftSpec({ mode: 'ngram', draftModelPath: '', draftKvQuantK: EKvQuantType.Q8_0 }),
		}), [], 10453, V030_CAPABILITIES);
		expect(ngramArgs).not.toContain('--cache-type-k-draft');
	});

	it('emits draft execution controls with modern flag names', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({
			specDecode: draftSpec({
				draftThreads: 4, draftThreadsBatch: 8,
				draftPoll: true, draftPollBatch: false,
				draftPrio: 2, draftPrioBatch: 1,
				draftCpuMoe: true, draftNCpuMoe: 3,
				draftCpuMask: '0x3', draftCpuStrict: true, draftCpuRange: '0-3',
			}),
		}), [], 10453, V030_CAPABILITIES);
		expect(args[args.indexOf('--spec-draft-threads') + 1]).toBe('4');
		expect(args[args.indexOf('--spec-draft-threads-batch') + 1]).toBe('8');
		expect(args[args.indexOf('--spec-draft-poll') + 1]).toBe('1');
		expect(args[args.indexOf('--spec-draft-poll-batch') + 1]).toBe('0');
		expect(args[args.indexOf('--spec-draft-prio') + 1]).toBe('2');
		expect(args[args.indexOf('--spec-draft-prio-batch') + 1]).toBe('1');
		expect(args).toContain('--spec-draft-cpu-moe');
		expect(args[args.indexOf('--spec-draft-ncmoe') + 1]).toBe('3');
		expect(args[args.indexOf('--spec-draft-cpu-mask') + 1]).toBe('0x3');
		expect(args[args.indexOf('--spec-draft-cpu-strict') + 1]).toBe('1');
		expect(args[args.indexOf('--spec-draft-cpu-range') + 1]).toBe('0-3');
	});

	it('falls back to legacy draft-control aliases on older backends', () => {
		const legacyCaps: ILlamaBackendCapabilities = {
			...B10453_CAPABILITIES,
			supportedFlags: [
				...B10453_CAPABILITIES.supportedFlags,
				'--threads-draft', '--threads-batch-draft', '--poll-draft', '--prio-draft', '--cpu-moe-draft',
			],
		};
		const args = buildArgs('/models/m.gguf', null, makeParams({
			specDecode: draftSpec({ draftThreads: 4, draftPoll: true, draftPrio: 2, draftCpuMoe: true }),
		}), [], 10453, legacyCaps);
		expect(args[args.indexOf('--threads-draft') + 1]).toBe('4');
		expect(args[args.indexOf('--poll-draft') + 1]).toBe('1');
		expect(args[args.indexOf('--prio-draft') + 1]).toBe('2');
		expect(args).toContain('--cpu-moe-draft');
		expect(args).not.toContain('--spec-draft-threads');
	});

	it('emits lookup caches only while speculative decoding is enabled', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({
			specDecode: draftSpec({ lookupCacheStatic: '/cache/static.bin', lookupCacheDynamic: '/cache/dyn.bin' }),
		}), [], 10453, V030_CAPABILITIES);
		expect(args[args.indexOf('--lookup-cache-static') + 1]).toBe('/cache/static.bin');
		expect(args[args.indexOf('--lookup-cache-dynamic') + 1]).toBe('/cache/dyn.bin');

		const offArgs = buildArgs('/models/m.gguf', null, makeParams({
			specDecode: { ...DEFAULT_LAUNCH_PARAMS.specDecode, lookupCacheStatic: '/cache/static.bin' },
		}), [], 10453, V030_CAPABILITIES);
		expect(offArgs).not.toContain('--lookup-cache-static');
	});

	it('emits backend-sampling and the reasoning-preserve tristate', () => {
		const on = buildArgs('/models/m.gguf', null, makeParams({ backendSampling: true, reasoningPreserve: true }), [], 10453, V030_CAPABILITIES);
		expect(on).toContain('--backend-sampling');
		expect(on).toContain('--reasoning-preserve');
		expect(on).not.toContain('--no-reasoning-preserve');

		const off = buildArgs('/models/m.gguf', null, makeParams({ reasoningPreserve: false }), [], 10453, V030_CAPABILITIES);
		expect(off).toContain('--no-reasoning-preserve');

		const defaults = buildArgs('/models/m.gguf', null, makeParams(), [], 10453, V030_CAPABILITIES);
		expect(defaults).not.toContain('--reasoning-preserve');
		expect(defaults).not.toContain('--no-reasoning-preserve');
	});

	it('emits slot prompt similarity and LoRA flags', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({
			slotPromptSimilarity: 0.5,
			loraAdapters: '/loras/a.gguf,/loras/b.gguf',
			loraScaled: '/loras/a.gguf:0.8',
			loraInitWithoutApply: true,
		}), [], 10453, V030_CAPABILITIES);
		expect(args[args.indexOf('--slot-prompt-similarity') + 1]).toBe('0.5');
		expect(args[args.indexOf('--lora') + 1]).toBe('/loras/a.gguf,/loras/b.gguf');
		expect(args[args.indexOf('--lora-scaled') + 1]).toBe('/loras/a.gguf:0.8');
		expect(args).toContain('--lora-init-without-apply');
	});

	it('emits advanced cache controls while preserving zero and unlimited values', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({
			cacheRam: -1,
			ctxCheckpoints: 0,
		}), [], 10453, V030_CAPABILITIES);
		expect(args[args.indexOf('--cache-ram') + 1]).toBe('-1');
		expect(args[args.indexOf('--ctx-checkpoints') + 1]).toBe('0');
	});

	it('emits mmproj loading controls as a tristate family', () => {
		const args = buildArgs('/models/m.gguf', '/models/mmproj.gguf', makeParams({
			mmprojUrl: 'https://example.com/mmproj.gguf',
			mmprojAuto: false,
			mmprojDevice: 'CUDA0',
			mmprojOffload: false,
		}), [], 10453, V030_CAPABILITIES);
		expect(args[args.indexOf('--mmproj-url') + 1]).toBe('https://example.com/mmproj.gguf');
		expect(args).toContain('--no-mmproj-auto');
		expect(args[args.indexOf('--mmproj-device') + 1]).toBe('CUDA0');
		expect(args).toContain('--no-mmproj-offload');

		const defaults = buildArgs('/models/m.gguf', '/models/mmproj.gguf', makeParams(), [], 10453, V030_CAPABILITIES);
		expect(defaults).not.toContain('--mmproj-auto');
		expect(defaults).not.toContain('--no-mmproj-auto');
	});

	it('omits every v0.3.0 option that a probed backend does not support', () => {
		const args = buildArgs('/models/m.gguf', null, makeParams({
			backendSampling: true,
			reasoningPreserve: true,
			slotPromptSimilarity: 0.5,
			cacheRam: 4096,
			ctxCheckpoints: 8,
			loraAdapters: '/loras/a.gguf',
			loraScaled: '/loras/a.gguf:0.8',
			loraInitWithoutApply: true,
			mmprojUrl: 'https://example.com/mmproj.gguf',
			mmprojAuto: true,
			mmprojDevice: 'CUDA0',
			mmprojOffload: true,
		}), [], 10453, B10453_CAPABILITIES);

		for (const flag of [
			'--backend-sampling', '--reasoning-preserve', '--slot-prompt-similarity',
			'--cache-ram', '--ctx-checkpoints',
			'--lora', '--lora-scaled', '--lora-init-without-apply',
			'--mmproj-url', '--mmproj-auto', '--mmproj-device', '--mmproj-offload',
		]) {
			expect(args).not.toContain(flag);
		}
	});
});
