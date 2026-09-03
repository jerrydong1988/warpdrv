// Regression tests for GGUF parameter-count inference. Real-world evidence
// (99 published GGUFs) showed the old regex required a separator before the
// "XB" token, so "31B Assistant" and "Gemma-4-E4B-It" fell through to
// "unknown" even though the size is right there in the name.
import { describe, it, expect } from 'vitest';
import {
	estimateParamCountFromSize,
	extractParamCount,
	formatParamCount,
	inferQuantTypeFromFileName,
	quantTypeFromFtype,
	resolveParamCount,
} from '../src/services/ggufParser';

describe('extractParamCount', () => {
	it('parses classic hyphenated names', () => {
		expect(extractParamCount('Llama-3.2-1B-Instruct')).toBe('1B');
		expect(extractParamCount('Qwen3.6-27B-Q8_0')).toBe('27B');
		expect(extractParamCount('Qwen3.5-122B-A10B')).toBe('122B');
	});

	it('parses space-separated names', () => {
		expect(extractParamCount('Orchestrator 8B')).toBe('8B');
		expect(extractParamCount('Nemotron 3 Super 120B A12B')).toBe('120B');
		expect(extractParamCount('Qwen3.6 35B A3B Uncensored Heretic Native MTP Preserved')).toBe('35B');
	});

	it('parses a size token at the start of the name (no separator)', () => {
		expect(extractParamCount('31B Assistant')).toBe('31B');
	});

	it('parses a size token directly after a letter (Gemma E4B naming)', () => {
		expect(extractParamCount('Gemma-4-E4B-It')).toBe('4B');
		expect(extractParamCount('Gemma 4 12B It Assistant')).toBe('12B');
	});

	it('normalizes fractions ("3.0B" -> "3B", "0.6b" -> "0.6B")', () => {
		expect(extractParamCount('Qwen3 Embedding 0.6b')).toBe('0.6B');
		expect(extractParamCount('Some-Model-3.0B')).toBe('3B');
	});

	it('ignores "bit" tokens without a digit prefix', () => {
		expect(extractParamCount('Model-1bit-quant')).toBe('unknown');
	});

	it('returns unknown when no size token exists', () => {
		expect(extractParamCount('Ling 3.0 Flash')).toBe('unknown');
		expect(extractParamCount('Step-3.7')).toBe('unknown');
		expect(extractParamCount('Deepseek-V4-Flash-0731')).toBe('unknown');
		expect(extractParamCount('Laguna S21 Polishing')).toBe('unknown');
		expect(extractParamCount('KAT Coder V2.5 Dev')).toBe('unknown');
		expect(extractParamCount('Safetensors')).toBe('unknown');
		expect(extractParamCount('')).toBe('unknown');
	});

	it('falls back to the file name when the metadata name is empty', () => {
		expect(extractParamCount('', 'C:/models/nvidia_Nemotron-3-Super-120B-A12B-Q4_K_L-00002-of-00003.gguf')).toBe('120B');
		expect(extractParamCount('', 'C:/models/Qwen3-Next-80B-A3B-Instruct-UD-Q8_K_XL-00002-of-00002.gguf')).toBe('80B');
	});

	it('falls back to the file name when the metadata name is generic', () => {
		expect(extractParamCount('Draft', 'C:/models/gemma-4-26B-A4B-it-assistant-Q8_0.gguf')).toBe('26B');
	});

	it('does not fall back when the file name has no size token either', () => {
		expect(extractParamCount('Step-3.7', 'C:/models/Step-3.7-Flash-APEX-I-Compact.gguf')).toBe('unknown');
		expect(extractParamCount('', 'C:/models/Ling-3.0-flash-AD-Q5_K_S-00002-of-00002.gguf')).toBe('unknown');
	});
});

describe('formatParamCount', () => {
	it('formats raw counts as compact billions', () => {
		expect(formatParamCount(8_000_000_000)).toBe('8B');
		expect(formatParamCount(7_600_000_000)).toBe('7.6B');
		expect(formatParamCount(600_000_000)).toBe('0.6B');
	});

	it('rejects non-finite or non-positive values', () => {
		expect(formatParamCount(0)).toBe('unknown');
		expect(formatParamCount(-5)).toBe('unknown');
		expect(formatParamCount('nope')).toBe('unknown');
		expect(formatParamCount(undefined)).toBe('unknown');
	});
});

describe('resolveParamCount', () => {
	it('prefers the exact tensor-shape count over inaccurate publisher metadata and names', () => {
		expect(resolveParamCount({
			computedParameterCount: 196_956_130_432,
			metadataParameterCount: 7_400_000_000,
			generalName: 'Step-3.7 7.4B',
			filePath: 'C:/models/Step-3.7-Flash-APEX-I-Compact.gguf',
		})).toBe('196.96B');
	});

	it('uses declared metadata, then names, only when no exact count is available', () => {
		expect(resolveParamCount({ metadataParameterCount: 27_000_000_000, generalName: 'Wrong 7B' })).toBe('27B');
		expect(resolveParamCount({ generalName: 'Qwen 122B A10B' })).toBe('122B');
		expect(resolveParamCount({ generalBasename: 'Model-35B-A3B' })).toBe('35B');
	});
});

describe('inferQuantTypeFromFileName', () => {
	it('recognizes APEX mixed-precision profiles', () => {
		expect(inferQuantTypeFromFileName('C:/models/Step-3.7-Flash-APEX-I-Compact.gguf')).toBe('APEX-I-Compact');
		expect(inferQuantTypeFromFileName('C:/models/Nemotron-120B-APEX-I-Balanced.gguf')).toBe('APEX-I-Balanced');
		expect(inferQuantTypeFromFileName('C:/models/Qwen-APEX-Quality.gguf')).toBe('APEX-Quality');
		expect(inferQuantTypeFromFileName('C:/models/Future-APEX-I-Ultra.gguf')).toBe('APEX-I-Ultra');
		expect(inferQuantTypeFromFileName('C:/models/Legacy-APEX.gguf')).toBe('APEX');
	});

	it('preserves modern and extended llama.cpp quantization names', () => {
		expect(inferQuantTypeFromFileName('C:/models/Qwen-27B-UD-Q4_K_XL.gguf')).toBe('Q4_K_XL');
		expect(inferQuantTypeFromFileName('C:/models/MoE-MXFP4_MOE.gguf')).toBe('MXFP4_MOE');
		expect(inferQuantTypeFromFileName('C:/models/Model-NVFP4.gguf')).toBe('NVFP4');
		expect(inferQuantTypeFromFileName('C:/models/Model-TQ1_0.gguf')).toBe('TQ1_0');
		expect(inferQuantTypeFromFileName('C:/models/Model-FP16.gguf')).toBe('F16');
	});

	it('ignores quant-looking parent directory names', () => {
		expect(inferQuantTypeFromFileName('C:/models/Q4_K_M/model.gguf')).toBe('unknown');
	});

	it('strips split suffixes without losing the quantization token', () => {
		expect(inferQuantTypeFromFileName('C:/models/Model-IQ3_XXS-00002-of-00003.gguf')).toBe('IQ3_XXS');
	});
});

describe('estimateParamCountFromSize', () => {
	it('estimates a model at a known quant with the ≈ prefix', () => {
		// 10B params at 4.5 bpw = 10e9 * 4.5 / 8 bytes
		expect(estimateParamCountFromSize(10e9 * 4.5 / 8, 'Q4_0')).toBe('≈10B');
		// 120B at IQ2_XXS (2.06 bpw)
		expect(estimateParamCountFromSize(120e9 * 2.06 / 8, 'IQ2_XXS')).toBe('≈120B');
	});

	it('keeps one decimal below 10B', () => {
		expect(estimateParamCountFromSize(0.6e9 * 16 / 8, 'F16')).toBe('≈0.6B');
		expect(estimateParamCountFromSize(3.5e9 * 5.54 / 8, 'Q5_K_S')).toBe('≈3.5B');
	});

	it('falls back to the family average for unknown K variants', () => {
		// Q4_K_XL is not in the table -> base Q4_K average at 4.8 bpw
		expect(estimateParamCountFromSize(8e9 * 4.8 / 8, 'Q4_K_XL')).toBe('≈8B');
	});

	it('returns unknown when the quant type is unknown', () => {
		expect(estimateParamCountFromSize(10e9, 'unknown')).toBe('unknown');
		expect(estimateParamCountFromSize(10e9, '')).toBe('unknown');
		expect(estimateParamCountFromSize(10e9, 'APEX-I-Balanced')).toBe('unknown');
	});

	it('rejects invalid or too-small sizes', () => {
		expect(estimateParamCountFromSize(0, 'Q8_0')).toBe('unknown');
		expect(estimateParamCountFromSize(-1, 'Q8_0')).toBe('unknown');
		expect(estimateParamCountFromSize(1024, 'Q8_0')).toBe('unknown');
	});
});

describe('quantTypeFromFtype', () => {
	it('maps current llama_ftype enum values', () => {
		expect(quantTypeFromFtype(7)).toBe('Q8_0');
		expect(quantTypeFromFtype(8)).toBe('Q5_0');
		expect(quantTypeFromFtype(15)).toBe('Q4_K_M');
		expect(quantTypeFromFtype(32)).toBe('BF16');
		expect(quantTypeFromFtype(38)).toBe('MXFP4_MOE');
		expect(quantTypeFromFtype(41)).toBe('Q2_0');
	});

	it('masks llama.cpp guessed-file-type flag', () => {
		expect(quantTypeFromFtype(1024 + 15)).toBe('Q4_K_M');
	});

	it('returns unknown for unmapped values', () => {
		expect(quantTypeFromFtype(35)).toBe('unknown');
		expect(quantTypeFromFtype(99)).toBe('unknown');
		expect(quantTypeFromFtype(undefined)).toBe('unknown');
	});
});
