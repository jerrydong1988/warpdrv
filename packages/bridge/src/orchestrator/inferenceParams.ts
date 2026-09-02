const REASONING_FORMAT_ALIASES: Record<string, string> = {
	// Stored by WarpCore <= 0.5.8. llama.cpp never accepted these names.
	parsed: 'deepseek',
	raw: 'none',
};

export function normalizeLlamaReasoningFormat(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length === 0) return undefined;
	return REASONING_FORMAT_ALIASES[value] ?? value;
}

// Narrowers: params arrive as Record<string, unknown> (UI/settings blobs).
// Reject mistyped values instead of forwarding them to llama.cpp.
const toNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
const toBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);
const toArray = (value: unknown): unknown[] | undefined => (Array.isArray(value) ? value : undefined);
const toRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;

export function buildLlamaInferenceParams(params: Record<string, unknown>): Record<string, unknown> {
	const p: Record<string, unknown> = params;

	const temperature = toNumber(p.temperature);
	const topP = toNumber(p.topP);
	const topK = toNumber(p.topK);
	const maxTokens = toNumber(p.maxTokens);
	const frequencyPenalty = toNumber(p.frequencyPenalty);
	const presencePenalty = toNumber(p.presencePenalty);
	const seed = toNumber(p.seed);
	const repeatPenalty = toNumber(p.repeatPenalty);
	const minP = toNumber(p.minP);
	const mirostatMode = toNumber(p.mirostatMode);
	const mirostatTau = toNumber(p.mirostatTau);
	const mirostatEta = toNumber(p.mirostatEta);
	const cachePrompt = toBoolean(p.cachePrompt);
	const responseFormat = typeof p.responseFormat === 'string' ? p.responseFormat : undefined;
	const reasoningFormat = normalizeLlamaReasoningFormat(p.reasoningFormat);
	const reasoningEffort = typeof p.reasoningEffort === 'string' ? p.reasoningEffort : undefined;
	const reasoningBudgetTokens = toNumber(p.reasoningBudgetTokens);
	const reasoningBudgetMessage = typeof p.reasoningBudgetMessage === 'string' ? p.reasoningBudgetMessage : undefined;
	const enableThinking = toBoolean(p.enableThinking);
	const typicalP = toNumber(p.typicalP);
	const ignoreEos = toBoolean(p.ignoreEos);
	const logitBias = toArray(p.logitBias);
	const dryMultiplier = toNumber(p.dryMultiplier);
	const dryBase = toNumber(p.dryBase);
	const dryAllowedLength = toNumber(p.dryAllowedLength);
	const dryPenaltyLastN = toNumber(p.dryPenaltyLastN);
	const topNSigma = toNumber(p.topNSigma);
	const xtcProbability = toNumber(p.xtcProbability);
	const xtcThreshold = toNumber(p.xtcThreshold);
	const dynatempRange = toNumber(p.dynatempRange);
	const dynatempExponent = toNumber(p.dynatempExponent);
	const repeatLastN = toNumber(p.repeatLastN);
	const nProbs = toNumber(p.n_probs);
	const samplers = toArray(p.samplers);
	const grammar = p.grammar;
	const jsonSchema = p.jsonSchema;
	const adaptiveTarget = toNumber(p.adaptiveTarget);
	const adaptiveDecay = toNumber(p.adaptiveDecay);
	const extraSamplingParams = toRecord(p.extraSamplingParams);
	const stopSequences = toArray(p.stopSequences);

	return {
		...(temperature !== undefined ? { temperature } : {}),
		...(topP !== undefined ? { top_p: topP } : {}),
		...(topK !== undefined ? { top_k: topK } : {}),
		...(maxTokens !== undefined && maxTokens > 0 ? { max_tokens: maxTokens } : {}),
		...(frequencyPenalty ? { frequency_penalty: frequencyPenalty } : {}),
		...(presencePenalty ? { presence_penalty: presencePenalty } : {}),
		...(seed !== undefined && seed >= 0 ? { seed } : {}),
		...(repeatPenalty !== undefined && repeatPenalty !== 1.0 ? { repeat_penalty: repeatPenalty } : {}),
		...(minP !== undefined && minP > 0 ? { min_p: minP } : {}),
		...(mirostatMode !== undefined && mirostatMode > 0
			? { mirostat: mirostatMode, mirostat_tau: mirostatTau, mirostat_eta: mirostatEta }
			: {}),
		...(cachePrompt ? { cache_prompt: true } : {}),
		...(responseFormat && responseFormat !== 'text' ? { response_format: { type: responseFormat } } : {}),
		...(reasoningFormat !== undefined ? { reasoning_format: reasoningFormat } : {}),
		...(reasoningEffort !== undefined ? { reasoning_effort: reasoningEffort } : {}),
		...(reasoningBudgetTokens !== undefined ? { reasoning_budget_tokens: reasoningBudgetTokens } : {}),
		...(reasoningBudgetMessage ? { reasoning_budget_message: reasoningBudgetMessage } : {}),
		...(enableThinking !== undefined
			? { chat_template_kwargs: { enable_thinking: enableThinking } }
			: {}),
		...(typicalP !== undefined ? { typical_p: typicalP } : {}),
		...(ignoreEos !== undefined ? { ignore_eos: ignoreEos } : {}),
		...(logitBias && logitBias.length ? { logit_bias: logitBias } : {}),
		...(dryMultiplier ? { dry_multiplier: dryMultiplier } : {}),
		...(dryBase ? { dry_base: dryBase } : {}),
		...(dryAllowedLength ? { dry_allowed_length: dryAllowedLength } : {}),
		...(dryPenaltyLastN ? { dry_penalty_last_n: dryPenaltyLastN } : {}),
		...(topNSigma !== undefined ? { top_n_sigma: topNSigma } : {}),
		...(xtcProbability ? { xtc_probability: xtcProbability } : {}),
		...(xtcThreshold ? { xtc_threshold: xtcThreshold } : {}),
		...(dynatempRange ? { dynatemp_range: dynatempRange } : {}),
		...(dynatempExponent ? { dynatemp_exponent: dynatempExponent } : {}),
		...(repeatLastN !== undefined ? { repeat_last_n: repeatLastN } : {}),
		...(nProbs !== undefined ? { n_probs: nProbs } : {}),
		...(samplers && samplers.length ? { samplers } : {}),
		...(grammar ? { grammar } : {}),
		...(jsonSchema ? { json_schema: jsonSchema } : {}),
		...(adaptiveTarget ? { adaptive_target: adaptiveTarget } : {}),
		...(adaptiveDecay ? { adaptive_decay: adaptiveDecay } : {}),
		...(extraSamplingParams ? { ...extraSamplingParams } : {}),
		...(stopSequences && stopSequences.length ? { stop: stopSequences } : {}),
	};
}
