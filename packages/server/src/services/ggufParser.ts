import { gguf } from '@huggingface/gguf';
import type { IGgufMetadata } from '@warpcore/shared';
import { stat } from 'fs/promises';
import path from 'path';

export const GGUF_METADATA_PARSER_VERSION = 2;

// Parse GGUF file header and return metadata using @huggingface/gguf
export async function parseGgufMetadata(filePath: string): Promise<IGgufMetadata | null> {
	try {
		// The tensor directory contains the real shape of every stored tensor.
		// Summing those shapes is exact and works for mixed-precision formats such
		// as APEX, unlike estimating parameters from the file size and one BPW.
		const ggufData = await gguf(filePath, {
			allowLocalFile: true,
			computeParametersCount: true,
		});
		const meta = ggufData.metadata as Record<string, unknown>;

		// Get architecture
		const architecture = String(meta['general.architecture'] ?? 'unknown');

		// Get metadata values
		const nLayers = metadataNumber(meta, [`${architecture}.block_count`, 'general.block_count']);
		const nKvHeads = metadataNumber(meta, [`${architecture}.attention.head_count_kv`])
			|| metadataNumber(meta, [`${architecture}.attention.head_count`]);
		const embeddingDim = metadataNumber(meta, [`${architecture}.embedding_length`]);
		const feedForwardDim = metadataNumber(meta, [`${architecture}.feed_forward_length`])
			|| metadataNumber(meta, [
				`${architecture}.expert_feed_forward_length`,
				`${architecture}.expert_shared_feed_forward_length`,
			]);
		const contextLength = metadataNumber(meta, [`${architecture}.context_length`]);
		const generalName = String(meta['general.name'] ?? '');
		const generalBasename = String(meta['general.basename'] ?? '');

		// Get file size
		const fileStat = await stat(filePath);

		// File names preserve profiles which general.file_type cannot express
		// (APEX-I-Balanced, Q4_K_XL, etc.). Only inspect the basename so a parent
		// directory cannot accidentally determine the file's quantization.
		const fileNameQuantType = inferQuantTypeFromFileName(filePath);
		const quantType = fileNameQuantType !== 'unknown'
			? fileNameQuantType
			: quantTypeFromFtype(meta['general.file_type']);

		const parameterCount = normalizeParameterCount(ggufData.parameterCount);
		const paramCount = resolveParamCount({
			computedParameterCount: parameterCount,
			metadataParameterCount: meta['general.parameter_count'],
			generalName,
			generalBasename,
			filePath,
		});

		return {
			architecture,
			paramCount,
			...(parameterCount !== null ? { parameterCount } : {}),
			quantType,
			nLayers,
			nKvHeads,
			embeddingDim,
			feedForwardDim,
			contextLength,
			fileSize: fileStat.size,
			vocabSize: metadataNumber(meta, ['tokenizer.vocab_size', `${architecture}.vocab_size`])
				|| metadataArrayLength(meta['tokenizer.ggml.tokens']),
			tensorCount: Number(ggufData.tensorInfos?.length ?? meta['general.tensor_count'] ?? 0),
			nextnPredictLayers: metadataNumber(meta, [`${architecture}.nextn_predict_layers`]),
			parserVersion: GGUF_METADATA_PARSER_VERSION,
		};
	} catch (error) {
		console.error(`Failed to parse GGUF metadata for ${filePath}:`, error);
		return null;
	}
}

// Some architectures encode per-layer values as GGUF arrays. A representative
// positive maximum avoids leaking NaN/null into the API while retaining useful
// values for hybrid and MoE models whose non-applicable layers contain zeroes.
function metadataNumber(meta: Record<string, unknown>, keys: string[]): number {
	for (const key of keys) {
		const raw = meta[key];
		const values = Array.isArray(raw) ? raw : [raw];
		const positive = values
			.filter(value => value !== null && value !== undefined && value !== '')
			.map(Number)
			.filter(value => Number.isFinite(value) && value > 0);
		if (positive.length > 0) return Math.max(...positive);
	}
	return 0;
}

function metadataArrayLength(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function normalizeParameterCount(value: unknown): number | null {
	const n = Number(value);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Resolve parameter count without trusting optional publisher metadata over
// the file's tensor directory. Name parsing is retained only for malformed or
// unusually incomplete GGUF files whose tensor shapes cannot be counted.
export function resolveParamCount(args: {
	computedParameterCount?: unknown;
	metadataParameterCount?: unknown;
	generalName?: string;
	generalBasename?: string;
	filePath?: string;
}): string {
	const computed = formatParamCount(args.computedParameterCount);
	if (computed !== 'unknown') return computed;

	const declared = formatParamCount(args.metadataParameterCount);
	if (declared !== 'unknown') return declared;

	for (const candidate of [args.generalName, args.generalBasename]) {
		const inferred = extractParamCount(candidate ?? '');
		if (inferred !== 'unknown') return inferred;
	}

	return extractParamCount('', args.filePath);
}

// Format a raw parameter count (e.g. 8_000_000_000 or 7.6e9) as a compact
// "8B" / "7.6B" string; anything non-finite or non-positive stays "unknown"
export function formatParamCount(value: unknown): string {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) return 'unknown';
	return `${trimFraction(n / 1e9)}B`;
}

// Strip trailing zeros from a numeric fraction ("3.0" -> "3", "7.60" -> "7.6")
function trimFraction(v: number): string {
	return Number(v.toFixed(2)).toString();
}

// Extract parameter count from a model name or file name, e.g.:
// "Llama-3.2-1B-Instruct" -> "1B"
// "Nemotron 3 Super 120B A12B" -> "120B" (first token = total size)
// "31B Assistant" -> "31B" (token at string start — no separator required)
// "Gemma-4-E4B-It" -> "4B" (digit directly after a letter)
// "Ling 3.0 Flash" / "Step-3.7" -> "unknown" (no size token at all)
export function extractParamCount(name: string, filePath?: string): string {
	const sizeToken = /(\d+(?:\.\d+)?)\s*[bB](?![A-Za-z])/;
	const nameMatch = name.match(sizeToken);
	if (nameMatch) return `${trimFraction(Number(nameMatch[1]))}B`;

	if (filePath) {
		const fileMatch = path.basename(filePath).match(sizeToken);
		if (fileMatch) return `${trimFraction(Number(fileMatch[1]))}B`;
	}

	return 'unknown';
}

// Prefer explicit filename profiles because the GGUF ftype enum represents a
// single llama.cpp quantization preset and cannot describe role/layer-adaptive
// mixed precision such as APEX.
export function inferQuantTypeFromFileName(filePath: string): string {
	const fileName = path.basename(filePath).replace(SHARD_SUFFIX, '').replace(/\.gguf$/i, '');

	const apexMatch = fileName.match(/(?:^|[-_])APEX[-_](I[-_])?([A-Z][A-Z0-9]*)(?=$|[-_])/i);
	if (apexMatch) {
		const profile = `${apexMatch[1] ? 'I-' : ''}${toTitleCase(apexMatch[2]!)}`;
		return `APEX-${profile}`;
	}
	if (/(?:^|[-_])APEX(?=$|[-_])/i.test(fileName)) return 'APEX';

	const quantMatch = fileName.match(
		/(?:^|[-_.])((?:IQ\d+_(?:XXS|XS|S|M|NL|BN)(?:_\d+_\d+)?)|(?:Q\d+_(?:[01](?:_\d+_\d+)?|K(?:_[SML]|_XL)?))|(?:TQ\d+_0)|(?:MXFP\d+(?:_MOE)?)|(?:NVFP\d+)|BF16|FP16|F16|F32)(?=$|[-_.])/i,
	);
	if (!quantMatch) return 'unknown';

	const normalized = quantMatch[1]!.toUpperCase();
	return normalized === 'FP16' ? 'F16' : normalized;
}

const SHARD_SUFFIX = /-\d{5}-of-\d{5}$/i;

function toTitleCase(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

// Average bits per weight for llama.cpp quant types. Used ONLY for the
// size-based parameter estimation (result is prefixed with "≈"); exact
// S/M/L K variants where known, family averages otherwise.
const QUANT_BPW: Record<string, number> = {
	F32: 32, F16: 16, BF16: 16,
	Q2_K: 3.35, Q2_K_S: 3.35, Q3_K: 3.7, Q3_K_S: 3.4, Q3_K_M: 3.91, Q3_K_L: 4.28,
	Q4_0: 4.5, Q4_1: 5.0, Q4_K: 4.8, Q4_K_S: 4.58, Q4_K_M: 4.85, Q4_K_L: 4.97,
	Q5_0: 5.5, Q5_1: 6.0, Q5_K: 5.6, Q5_K_S: 5.54, Q5_K_M: 5.69, Q5_K_L: 5.79,
	Q6_K: 6.56, Q8_0: 8.5, Q8_1: 8.5, Q8_K: 8.5,
	IQ1_S: 1.56, IQ1_M: 1.75, IQ1_BN: 1.61,
	IQ2_S: 2.58, IQ2_XXS: 2.06, IQ2_XS: 2.31,
	IQ2_M: 2.75, IQ3_S: 3.44, IQ3_M: 3.7, IQ3_XS: 3.25, IQ3_XXS: 3.06,
	IQ4_NL: 4.5, IQ4_XS: 4.25,
	MXFP4: 4.5, MXFP4_MOE: 4.5, NVFP4: 4.5,
	Q1_0: 1.75, Q2_0: 2.5,
	TQ1_0: 1.62, TQ2_0: 2.5,
};

// GGUF general.file_type enum -> { label, bpw }. Only consulted when the
// file name carries no recognizable quant token (e.g. "...-I-Balanced.gguf").
const GGUF_FTYPE: Record<number, { label: string; bpw: number }> = {
	0: { label: 'F32', bpw: 32 }, 1: { label: 'F16', bpw: 16 },
	2: { label: 'Q4_0', bpw: 4.5 }, 3: { label: 'Q4_1', bpw: 5.0 },
	7: { label: 'Q8_0', bpw: 8.5 }, 8: { label: 'Q5_0', bpw: 5.5 },
	9: { label: 'Q5_1', bpw: 6.0 }, 10: { label: 'Q2_K', bpw: 3.35 },
	11: { label: 'Q3_K_S', bpw: 3.4 }, 12: { label: 'Q3_K_M', bpw: 3.91 },
	13: { label: 'Q3_K_L', bpw: 4.28 }, 14: { label: 'Q4_K_S', bpw: 4.58 },
	15: { label: 'Q4_K_M', bpw: 4.85 }, 16: { label: 'Q5_K_S', bpw: 5.54 },
	17: { label: 'Q5_K_M', bpw: 5.69 }, 18: { label: 'Q6_K', bpw: 6.56 },
	19: { label: 'IQ2_XXS', bpw: 2.06 }, 20: { label: 'IQ2_XS', bpw: 2.31 },
	21: { label: 'Q2_K_S', bpw: 3.35 }, 22: { label: 'IQ3_XS', bpw: 3.25 },
	23: { label: 'IQ3_XXS', bpw: 3.06 }, 24: { label: 'IQ1_S', bpw: 1.56 },
	25: { label: 'IQ4_NL', bpw: 4.5 }, 26: { label: 'IQ3_S', bpw: 3.44 },
	27: { label: 'IQ3_M', bpw: 3.7 }, 28: { label: 'IQ2_S', bpw: 2.58 },
	29: { label: 'IQ2_M', bpw: 2.75 }, 30: { label: 'IQ4_XS', bpw: 4.25 },
	31: { label: 'IQ1_M', bpw: 1.75 }, 32: { label: 'BF16', bpw: 16 },
	36: { label: 'TQ1_0', bpw: 1.62 }, 37: { label: 'TQ2_0', bpw: 2.5 },
	38: { label: 'MXFP4_MOE', bpw: 4.5 }, 39: { label: 'NVFP4', bpw: 4.5 },
	40: { label: 'Q1_0', bpw: 1.75 }, 41: { label: 'Q2_0', bpw: 2.5 },
};

// Map a GGUF general.file_type enum value to a quant label, or "unknown"
export function quantTypeFromFtype(ftype: unknown): string {
	const value = Number(ftype);
	if (!Number.isInteger(value) || value < 0) return 'unknown';
	return GGUF_FTYPE[value & ~1024]?.label ?? 'unknown';
}

function quantBpw(quantType: string): number | null {
	if (!quantType || quantType === 'unknown') return null;
	const direct = QUANT_BPW[quantType];
	if (direct !== undefined) return direct;
	// Unknown K variant (e.g. Q4_K_XL): fall back to the base family average
	return QUANT_BPW[quantType.replace(/_XL$/i, '')] ?? null;
}

// Estimate total parameters from on-disk size and quant type. Approximate by
// nature (embeddings, output head and quant overhead all shift the number),
// hence the "≈" prefix. Returns "unknown" when the quant type is unknown or
// the size is too small to be meaningful.
export function estimateParamCountFromSize(sizeBytes: number, quantType: string): string {
	if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 'unknown';
	const bpw = quantBpw(quantType);
	if (bpw === null) return 'unknown';

	const billions = (sizeBytes * 8) / bpw / 1e9;
	if (billions < 0.05) return 'unknown';
	const rounded = billions >= 10
		? Math.round(billions).toString()
		: Number(billions.toFixed(1)).toString();
	return `≈${rounded}B`;
}
