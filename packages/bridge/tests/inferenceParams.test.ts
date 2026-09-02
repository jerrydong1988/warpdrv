import { describe, expect, it } from 'vitest';
import { buildLlamaInferenceParams, normalizeLlamaReasoningFormat } from '../src/orchestrator/inferenceParams';

describe('buildLlamaInferenceParams', () => {
	it('returns an empty object for empty input', () => {
		expect(buildLlamaInferenceParams({})).toEqual({});
	});

	it('maps sampling parameters to llama.cpp names', () => {
		const result = buildLlamaInferenceParams({
			temperature: 0.7,
			topP: 0.9,
			topK: 40,
			maxTokens: 2048,
			frequencyPenalty: 0.5,
			presencePenalty: 0.3,
			seed: 42,
			repeatPenalty: 1.1,
			minP: 0.05,
		});
		expect(result).toMatchObject({
			temperature: 0.7,
			top_p: 0.9,
			top_k: 40,
			max_tokens: 2048,
			frequency_penalty: 0.5,
			presence_penalty: 0.3,
			seed: 42,
			repeat_penalty: 1.1,
			min_p: 0.05,
		});
	});

	it('drops zero/negative maxTokens and default repeatPenalty', () => {
		const result = buildLlamaInferenceParams({ maxTokens: 0, repeatPenalty: 1.0, seed: -1 });
		expect(result).not.toHaveProperty('max_tokens');
		expect(result).not.toHaveProperty('repeat_penalty');
		expect(result).not.toHaveProperty('seed');
	});

	it('expands mirostat into the triple only when mirostatMode > 0', () => {
		expect(buildLlamaInferenceParams({ mirostatMode: 0 })).not.toHaveProperty('mirostat');
		expect(
			buildLlamaInferenceParams({ mirostatMode: 2, mirostatTau: 5, mirostatEta: 0.1 }),
		).toMatchObject({ mirostat: 2, mirostat_tau: 5, mirostat_eta: 0.1 });
	});

	it('maps reasoning fields including the legacy alias migration', () => {
		const result = buildLlamaInferenceParams({
			reasoningFormat: 'deepseek-legacy',
			reasoningEffort: 'xhigh',
			reasoningBudgetTokens: 2048,
			reasoningBudgetMessage: 'I will now answer.',
			enableThinking: true,
		});
		expect(result).toMatchObject({
			reasoning_format: 'deepseek-legacy',
			reasoning_effort: 'xhigh',
			reasoning_budget_tokens: 2048,
			reasoning_budget_message: 'I will now answer.',
			chat_template_kwargs: { enable_thinking: true },
		});
		expect(result.chat_template_kwargs).not.toHaveProperty('reasoning_effort');
		expect(buildLlamaInferenceParams({ reasoningFormat: 'parsed' }).reasoning_format).toBe('deepseek');
		expect(buildLlamaInferenceParams({ reasoningFormat: 'raw' }).reasoning_format).toBe('none');
	});

	it('maps responseFormat to the structured response_format object', () => {
		expect(buildLlamaInferenceParams({ responseFormat: 'json' })).toEqual({
			response_format: { type: 'json' },
		});
		expect(buildLlamaInferenceParams({ responseFormat: 'text' })).not.toHaveProperty('response_format');
	});

	it('passes through array and passthrough params', () => {
		const result = buildLlamaInferenceParams({
			stopSequences: ['END', 'STOP'],
			samplers: ['top_k', 'top_p'],
			grammar: 'root ::= "a"',
			jsonSchema: { type: 'object' },
			extraSamplingParams: { custom: 1 },
		});
		expect(result).toMatchObject({
			stop: ['END', 'STOP'],
			samplers: ['top_k', 'top_p'],
			grammar: 'root ::= "a"',
			json_schema: { type: 'object' },
			custom: 1,
		});
	});

	it('drops mistyped values instead of forwarding them', () => {
		const result = buildLlamaInferenceParams({
			temperature: 'hot',
			maxTokens: 'many',
			enableThinking: 'yes',
			stopSequences: 'END',
		});
		expect(result).toEqual({});
	});
});

describe('normalizeLlamaReasoningFormat', () => {
	it('returns undefined for non-string or empty input', () => {
		expect(normalizeLlamaReasoningFormat(undefined)).toBeUndefined();
		expect(normalizeLlamaReasoningFormat(5)).toBeUndefined();
		expect(normalizeLlamaReasoningFormat('')).toBeUndefined();
	});

	it('migrates parsed/raw aliases and passes everything else through', () => {
		expect(normalizeLlamaReasoningFormat('parsed')).toBe('deepseek');
		expect(normalizeLlamaReasoningFormat('raw')).toBe('none');
		expect(normalizeLlamaReasoningFormat('other')).toBe('other');
	});
});
