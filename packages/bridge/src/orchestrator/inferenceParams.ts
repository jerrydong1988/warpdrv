const REASONING_FORMAT_ALIASES: Record<string, string> = {
	// Stored by WarpCore <= 0.5.8. llama.cpp never accepted these names.
	parsed: 'deepseek',
	raw: 'none',
};

export function normalizeLlamaReasoningFormat(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length === 0) return undefined;
	return REASONING_FORMAT_ALIASES[value] ?? value;
}

export function buildLlamaInferenceParams(params: Record<string, unknown>): Record<string, unknown> {
	const p = params as any;
	const reasoningFormat = normalizeLlamaReasoningFormat(p.reasoningFormat);
	return {
		...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
		...(p.topP !== undefined ? { top_p: p.topP } : {}),
		...(p.topK !== undefined ? { top_k: p.topK } : {}),
		...(p.maxTokens > 0 ? { max_tokens: p.maxTokens } : {}),
		...(p.frequencyPenalty ? { frequency_penalty: p.frequencyPenalty } : {}),
		...(p.presencePenalty ? { presence_penalty: p.presencePenalty } : {}),
		...(p.seed >= 0 ? { seed: p.seed } : {}),
		...(p.repeatPenalty !== 1.0 ? { repeat_penalty: p.repeatPenalty } : {}),
		...(p.minP > 0 ? { min_p: p.minP } : {}),
		...(p.mirostatMode > 0 ? { mirostat: p.mirostatMode, mirostat_tau: p.mirostatTau, mirostat_eta: p.mirostatEta } : {}),
		...(p.cachePrompt ? { cache_prompt: true } : {}),
		...(p.responseFormat && p.responseFormat !== 'text' ? { response_format: { type: p.responseFormat } } : {}),
		...(reasoningFormat !== undefined ? { reasoning_format: reasoningFormat } : {}),
		...(p.reasoningEffort !== undefined ? { reasoning_effort: p.reasoningEffort } : {}),
		...(p.reasoningBudgetTokens !== undefined ? { reasoning_budget_tokens: p.reasoningBudgetTokens } : {}),
		...(p.reasoningBudgetMessage ? { reasoning_budget_message: p.reasoningBudgetMessage } : {}),
		...(p.enableThinking !== undefined
			? { chat_template_kwargs: { enable_thinking: p.enableThinking } }
			: {}),
		...(p.typicalP !== undefined ? { typical_p: p.typicalP } : {}),
		...(p.ignoreEos !== undefined ? { ignore_eos: p.ignoreEos } : {}),
		...(p.logitBias && p.logitBias.length ? { logit_bias: p.logitBias } : {}),
		...(p.dryMultiplier ? { dry_multiplier: p.dryMultiplier } : {}),
		...(p.dryBase ? { dry_base: p.dryBase } : {}),
		...(p.dryAllowedLength ? { dry_allowed_length: p.dryAllowedLength } : {}),
		...(p.dryPenaltyLastN ? { dry_penalty_last_n: p.dryPenaltyLastN } : {}),
		...(p.topNSigma !== undefined ? { top_n_sigma: p.topNSigma } : {}),
		...(p.xtcProbability ? { xtc_probability: p.xtcProbability } : {}),
		...(p.xtcThreshold ? { xtc_threshold: p.xtcThreshold } : {}),
		...(p.dynatempRange ? { dynatemp_range: p.dynatempRange } : {}),
		...(p.dynatempExponent ? { dynatemp_exponent: p.dynatempExponent } : {}),
		...(p.repeatLastN !== undefined ? { repeat_last_n: p.repeatLastN } : {}),
		...(p.n_probs !== undefined ? { n_probs: p.n_probs } : {}),
		...(p.samplers && p.samplers.length ? { samplers: p.samplers } : {}),
		...(p.grammar ? { grammar: p.grammar } : {}),
		...(p.jsonSchema ? { json_schema: p.jsonSchema } : {}),
		...(p.adaptiveTarget ? { adaptive_target: p.adaptiveTarget } : {}),
		...(p.adaptiveDecay ? { adaptive_decay: p.adaptiveDecay } : {}),
		...(p.extraSamplingParams ? { ...p.extraSamplingParams } : {}),
		...(p.stopSequences && p.stopSequences.length ? { stop: p.stopSequences } : {}),
	};
}
