import { describe, expect, it } from 'vitest';
import { buildLlamaInferenceParams } from '../../bridge/src/orchestrator/inferenceParams';

describe('llama.cpp inference parameter mapping', () => {
	it('uses current top-level reasoning fields and request budget names', () => {
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
	});

	it('migrates legacy parsed/raw reasoning-format values', () => {
		expect(buildLlamaInferenceParams({ reasoningFormat: 'parsed' }).reasoning_format).toBe('deepseek');
		expect(buildLlamaInferenceParams({ reasoningFormat: 'raw' }).reasoning_format).toBe('none');
	});
});
