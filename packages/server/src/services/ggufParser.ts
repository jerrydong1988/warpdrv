import { gguf } from '@huggingface/gguf';
import type { IGgufMetadata } from '@warpcore/shared';
import { stat } from 'fs/promises';
import path from 'path';

// Parse GGUF file header and return metadata using @huggingface/gguf
export async function parseGgufMetadata(filePath: string): Promise<IGgufMetadata | null> {
	try {
		const ggufData = await gguf(filePath, { allowLocalFile: true });
		const meta = ggufData.metadata as Record<string, unknown>;

		// Get architecture
		const architecture = String(meta['general.architecture'] ?? 'unknown');

		// Get metadata values
		const nLayers = Number(meta[`${architecture}.block_count`] ?? meta['general.block_count'] ?? 0);
		const nKvHeads = Number(meta[`${architecture}.attention.head_count_kv`] ?? 0);
		const embeddingDim = Number(meta[`${architecture}.embedding_length`] ?? 0);
		const feedForwardDim = Number(meta[`${architecture}.feed_forward_length`] ?? 0);
		const contextLength = Number(meta[`${architecture}.context_length`] ?? 0);
		const generalName = String(meta['general.name'] ?? '');

		// Get file size
		const fileStat = await stat(filePath);

		// Infer quant type from the file name (more reliable than the file_type
		// enum, and keeps the K variant), then fall back to the enum value.
		// FP16 precedes F16 so llama.cpp's "-fp16-" naming is recognized.
		const quantMatch = filePath.match(/[-_](Q\d[\w_]*|IQ\d[\w_]*|MXFP\d+|NVFP\d+|FP16|F16|F32|BF16)/i);
		const quantType = quantMatch ? quantMatch[1]!.toUpperCase() : quantTypeFromFtype(meta['general.file_type']);

		// Parameter count sources, in order of reliability:
		// 1. general.parameter_count — authoritative, but absent in most published GGUFs
		// 2. "XB" token in general.name (e.g. "Nemotron 3 Super 120B A12B")
		// 3. "XB" token in the file name (e.g. shards whose general.name is empty)
		const rawParamCount = meta['general.parameter_count'];
		const paramCount = formatParamCount(rawParamCount) === 'unknown'
			? extractParamCount(generalName, filePath)
			: formatParamCount(rawParamCount);

		return {
			architecture,
			paramCount,
			quantType,
			nLayers,
			nKvHeads,
			embeddingDim,
			feedForwardDim,
			contextLength,
			fileSize: fileStat.size,
			vocabSize: Number(meta['tokenizer.vocab_size'] ?? 0),
			tensorCount: Number(ggufData.tensorInfos?.length ?? meta['general.tensor_count'] ?? 0),
			nextnPredictLayers: Number(meta[`${architecture}.nextn_predict_layers`] ?? 0),
		};
	} catch (error) {
		console.error(`Failed to parse GGUF metadata for ${filePath}:`, error);
		return null;
	}
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

// Average bits per weight for llama.cpp quant types. Used ONLY for the
// size-based parameter estimation (result is prefixed with "≈"); exact
// S/M/L K variants where known, family averages otherwise.
const QUANT_BPW: Record<string, number> = {
	F32: 32, F16: 16, BF16: 16,
	Q2_K: 3.35, Q3_K: 3.7, Q3_K_S: 3.4, Q3_K_M: 3.91, Q3_K_L: 4.28,
	Q4_0: 4.5, Q4_1: 5.0, Q4_K: 4.8, Q4_K_S: 4.58, Q4_K_M: 4.85, Q4_K_L: 4.97,
	Q5_0: 5.5, Q5_1: 6.0, Q5_K: 5.6, Q5_K_S: 5.54, Q5_K_M: 5.69, Q5_K_L: 5.79,
	Q6_K: 6.56, Q8_0: 8.5, Q8_1: 8.5, Q8_K: 8.5,
	IQ1_S: 1.56, IQ1_M: 1.75, IQ1_BN: 1.61,
	IQ2_S: 2.58, IQ2_XXS: 2.06, IQ2_XS: 2.31,
	IQ3_S: 3.44, IQ3_XXS: 3.06,
	IQ4_NL: 4.5, IQ4_XS: 4.25,
	MXFP4: 4.5, NVFP4: 4.5,
	TQ1_0: 1.62, TQ2_0: 2.5,
};

// GGUF general.file_type enum -> { label, bpw }. Only consulted when the
// file name carries no recognizable quant token (e.g. "...-I-Balanced.gguf").
const GGUF_FTYPE: Record<number, { label: string; bpw: number }> = {
	0: { label: 'F32', bpw: 32 }, 1: { label: 'F16', bpw: 16 },
	2: { label: 'Q4_0', bpw: 4.5 }, 3: { label: 'Q4_1', bpw: 5.0 },
	6: { label: 'Q5_0', bpw: 5.5 }, 7: { label: 'Q5_1', bpw: 6.0 },
	8: { label: 'Q8_0', bpw: 8.5 }, 9: { label: 'Q8_1', bpw: 8.5 },
	10: { label: 'Q2_K', bpw: 3.35 }, 11: { label: 'Q3_K', bpw: 3.7 },
	12: { label: 'Q4_K', bpw: 4.8 }, 13: { label: 'Q5_K', bpw: 5.6 },
	14: { label: 'Q6_K', bpw: 6.56 }, 15: { label: 'Q8_K', bpw: 8.5 },
	16: { label: 'IQ2_XXS', bpw: 2.06 }, 17: { label: 'IQ2_XS', bpw: 2.31 },
	18: { label: 'IQ3_XXS', bpw: 3.06 }, 19: { label: 'IQ1_S', bpw: 1.56 },
	20: { label: 'IQ4_NL', bpw: 4.5 }, 21: { label: 'IQ3_S', bpw: 3.44 },
	22: { label: 'IQ2_S', bpw: 2.58 }, 23: { label: 'IQ4_XS', bpw: 4.25 },
	24: { label: 'IQ1_M', bpw: 1.75 }, 25: { label: 'BF16', bpw: 16 },
	26: { label: 'Q4_0_4_4', bpw: 4.5 }, 27: { label: 'Q4_0_4_8', bpw: 4.5 },
	28: { label: 'Q4_0_8_8', bpw: 4.5 }, 29: { label: 'TQ1_0', bpw: 1.62 },
	30: { label: 'TQ2_0', bpw: 2.5 }, 31: { label: 'IQ1_BN', bpw: 1.61 },
	32: { label: 'IQ4_NL_4_4', bpw: 4.5 }, 33: { label: 'IQ4_NL_4_8', bpw: 4.5 },
	34: { label: 'IQ4_NL_8_8', bpw: 4.5 }, 35: { label: 'MXFP4', bpw: 4.5 },
};

// Map a GGUF general.file_type enum value to a quant label, or "unknown"
export function quantTypeFromFtype(ftype: unknown): string {
	return GGUF_FTYPE[Number(ftype)]?.label ?? 'unknown';
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
