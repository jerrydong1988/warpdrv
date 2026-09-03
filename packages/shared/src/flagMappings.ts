// ============================================================
// Flag Mappings
// Maps internal param field names to their command-line flag representations
// ============================================================

import { ELlamaFlashAttentionMode, ELlamaLoadMode } from './enums';

export interface IFlagMapping {
	field: string;
	flag: string; // The flag that enables the feature (e.g., '--jinja', '-dio')
	negated?: boolean; // If true, the flag DISABLES the feature (e.g., '--no-mmap' means mmap=false)
	valueFlag?: boolean; // If true, this flag takes a numeric value (e.g., '-ngl 999')
}

// Toggle flags that appear in BackendDialog COMMON_FLAGS
export const TOGGLE_FLAG_MAPPINGS: IFlagMapping[] = [
	{ field: 'noWarmup', flag: '--no-warmup' },
	{ field: 'jinja', flag: '--jinja' },
	{ field: 'swaFull', flag: '--swa-full' },
];

// Flags that take numeric values (flag followed by its value)
export const VALUE_FLAG_MAPPINGS: Record<string, string> = {
	gpuLayers: '-ngl',
	contextSize: '-c',
	batchSize: '-b',
	ubatchSize: '-ub',
	threads: '-t',
	threadsBatch: '-tb',
	flashAttnMode: '-fa',
};

// Common preset flags for quick-add in BackendDialog
export interface ICommonFlagPreset {
	field: string;
	flag: string;
	label: string;
}

export const COMMON_FLAG_PRESETS: ICommonFlagPreset[] = [
	{ field: 'gpuLayers', flag: '-ngl 999', label: 'Full GPU offload' },
	{ field: 'flashAttnMode', flag: '-fa auto', label: 'Flash Attention: auto' },
	{ field: 'loadMode', flag: '--load-mode auto', label: 'Model loading: auto' },
];

function getToggleLabel(mapping: IFlagMapping): string {
	if (mapping.negated) {
		return `Disable ${mapping.field.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
	}
	const labelMap: Record<string, string> = {
		mlock: 'Lock memory',
		directIo: 'Direct I/O',
		noWarmup: 'Skip warmup',
		jinja: 'Jinja templates',
		swaFull: 'SWA Full',
	};
	return labelMap[mapping.field] ?? mapping.field;
}

// Generate toggle presets from current, non-deprecated toggle mappings.
const TOGGLE_PRESETS: ICommonFlagPreset[] = TOGGLE_FLAG_MAPPINGS.map(m => ({
	field: m.field,
	flag: m.flag,
	label: getToggleLabel(m),
}));

// Combine all presets in order
export const ALL_COMMON_FLAGS: ICommonFlagPreset[] = [
	...COMMON_FLAG_PRESETS,
	...TOGGLE_PRESETS,
];

// Get the mapping for a given field name
export function getFlagMapping(field: string): IFlagMapping | undefined {
	return TOGGLE_FLAG_MAPPINGS.find(m => m.field === field);
}

// Check if a flag is present in an args array
export function hasFlag(args: string[], flag: string): boolean {
	return args.includes(flag);
}

export interface IParsedDefaultArgsParams {
	flashAttn?: boolean;
	flashAttnMode?: ELlamaFlashAttentionMode;
	loadMode?: ELlamaLoadMode;
	mlock?: boolean;
	mmap?: boolean;
	directIo?: boolean;
	noWarmup?: boolean;
	jinja?: boolean;
	swaFull?: boolean;
	[key: string]: boolean | ELlamaLoadMode | ELlamaFlashAttentionMode | undefined;
}

export interface ILlamaLoadModeParams {
	loadMode?: ELlamaLoadMode;
	mlock?: boolean;
	mmap?: boolean;
	directIo?: boolean;
}

// Resolve the canonical model-loading mode while preserving compatibility with
// server configurations saved before --load-mode replaced the legacy toggles.
export function resolveLlamaLoadMode(params: ILlamaLoadModeParams): ELlamaLoadMode {
	if (params.loadMode) return params.loadMode;
	if (params.directIo) return ELlamaLoadMode.DIO;
	if (params.mmap && params.mlock) return ELlamaLoadMode.MMAP_MLOCK;
	if (params.mmap) return ELlamaLoadMode.MMAP;
	if (params.mlock) return ELlamaLoadMode.MLOCK;
	return ELlamaLoadMode.NONE;
}

export function llamaLoadModeToLegacyParams(loadMode: ELlamaLoadMode): Pick<ILlamaLoadModeParams, 'mmap' | 'mlock' | 'directIo'> {
	return {
		mmap: loadMode === ELlamaLoadMode.MMAP || loadMode === ELlamaLoadMode.MMAP_MLOCK,
		mlock: loadMode === ELlamaLoadMode.MLOCK || loadMode === ELlamaLoadMode.MMAP_MLOCK,
		directIo: loadMode === ELlamaLoadMode.DIO,
	};
}

function getOptionValue(args: string[], aliases: string[]): string | undefined {
	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		for (const alias of aliases) {
			if (arg === alias) return args[index + 1];
			if (arg.startsWith(`${alias}=`)) return arg.slice(alias.length + 1);
		}
	}
	return undefined;
}

function parseLoadMode(defaultArgs: string[], argsSet: Set<string>): ELlamaLoadMode | undefined {
	const explicit = getOptionValue(defaultArgs, ['--load-mode', '-lm']);
	if (explicit && (Object.values(ELlamaLoadMode) as string[]).includes(explicit)) {
		return explicit as ELlamaLoadMode;
	}

	// Translate deprecated loader flags so existing backend records retain their
	// behavior when the launch UI switches to --load-mode.
	if (argsSet.has('-dio') || argsSet.has('--direct-io')) return ELlamaLoadMode.DIO;
	const mmapDisabled = argsSet.has('--no-mmap');
	const mlock = argsSet.has('--mlock');
	if (mmapDisabled && mlock) return ELlamaLoadMode.MLOCK;
	if (mmapDisabled) return ELlamaLoadMode.NONE;
	if (mlock) return ELlamaLoadMode.MMAP_MLOCK;
	if (argsSet.has('--mmap')) return ELlamaLoadMode.MMAP;
	return undefined;
}

// Parse backend defaultArgs into launch param values.
export function parseDefaultArgsToParams(defaultArgs: string[]): IParsedDefaultArgsParams {
	const argsSet = new Set(defaultArgs);
	const result: IParsedDefaultArgsParams = {};

	for (const mapping of TOGGLE_FLAG_MAPPINGS) {
		if (mapping.negated) {
			// For negated flags like --no-mmap: presence means false, absence means undefined
			result[mapping.field] = argsSet.has(mapping.flag) ? false : undefined;
		} else {
			// For positive flags: presence means true, absence means undefined
			result[mapping.field] = argsSet.has(mapping.flag) ? true : undefined;
		}
	}

	const flashValue = getOptionValue(defaultArgs, ['-fa', '--flash-attn']);
	const flashMode = flashValue && (Object.values(ELlamaFlashAttentionMode) as string[]).includes(flashValue)
		? flashValue as ELlamaFlashAttentionMode
		: argsSet.has('-fa') || argsSet.has('--flash-attn') ? ELlamaFlashAttentionMode.ON : undefined;
	if (flashMode) {
		result.flashAttnMode = flashMode;
		result.flashAttn = flashMode !== ELlamaFlashAttentionMode.OFF;
	}

	const loadMode = parseLoadMode(defaultArgs, argsSet);
	if (loadMode) {
		result.loadMode = loadMode;
		Object.assign(result, llamaLoadModeToLegacyParams(loadMode));
	}

	return result;
}

// Convert param values to flag array for backend defaultArgs
export function paramsToFlags(params: Record<string, boolean | ELlamaLoadMode | ELlamaFlashAttentionMode | undefined>): string[] {
	const flags: string[] = [];
	const flashAttnMode = params.flashAttnMode;
	if (typeof flashAttnMode === 'string' && (Object.values(ELlamaFlashAttentionMode) as string[]).includes(flashAttnMode)) {
		flags.push('-fa', flashAttnMode);
	}
	const loadMode = params.loadMode;
	if (typeof loadMode === 'string' && (Object.values(ELlamaLoadMode) as string[]).includes(loadMode)) {
		flags.push('--load-mode', loadMode);
	}

	for (const mapping of TOGGLE_FLAG_MAPPINGS) {
		const value = params[mapping.field];
		if (typeof value !== 'boolean') continue;

		if (mapping.negated) {
			// For negated flags: only add flag if value is false
			if (!value) {
				flags.push(mapping.flag);
			}
		} else {
			// For positive flags: only add flag if value is true
			if (value) {
				flags.push(mapping.flag);
			}
		}
	}

	return flags;
}
