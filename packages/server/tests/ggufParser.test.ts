// Regression tests for GGUF parameter-count inference. Real-world evidence
// (99 published GGUFs) showed the old regex required a separator before the
// "XB" token, so "31B Assistant" and "Gemma-4-E4B-It" fell through to
// "unknown" even though the size is right there in the name.
import { describe, it, expect } from 'vitest';
import { extractParamCount, formatParamCount } from '../src/services/ggufParser';

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
