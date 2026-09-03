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

		// Infer quant type from filename (more reliable than file_type enum)
		const quantMatch = filePath.match(/[-_](Q\d[\w_]*|IQ\d[\w_]*|MXFP\d+|NVFP\d+|F16|F32|BF16)/i);
		const quantType = quantMatch ? quantMatch[1]!.toUpperCase() : 'unknown';

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
