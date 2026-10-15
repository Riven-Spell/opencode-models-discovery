import type { ModelEnricher } from '../../core/model-enrichment'
import { createModelLimits } from '../../core/model-types'

function hasUsableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function createVLLMEnricher(_data: unknown): ModelEnricher {
  return {
    enrich(model) {
      const maxModelLen = model.max_model_len
      if (hasUsableNumber(maxModelLen)) {
        // vLLM reports only max_model_len, which describes the whole window
        // shared by input and output. Treat it as the context limit and let
        // createModelLimits bound the output limit to the default token
        // limit, matching the LM Studio enricher, so hosts do not reserve
        // the entire context for output tokens and reject requests that
        // exceed it after token accounting.
        const limits = createModelLimits(maxModelLen)
        if (limits) return { limit: limits }
      }
      return {}
    },
  }
}
