import { Injectable } from '@nitrostack/core';
import { getConfig } from '../../../common/config/env.js';
import type { GroundingPayload, GroundingSource } from './grounding.types.js';
import { AIIntelligenceError } from '../ai.errors.js';

@Injectable()
export class GroundingService {
  build(sources: GroundingSource[]): GroundingPayload {
    const config = getConfig();
    if (!sources.length) throw new AIIntelligenceError('AI_GROUNDING_FAILED', 'AI grounding requires at least one bounded source.', false);
    const boundedSources = sources.slice(0, 32);
    let prompt = '';
    for (const [index, source] of boundedSources.entries()) {
      const serialized = JSON.stringify(source.data, (_key, value) => typeof value === 'string' ? value.slice(0, 12_000) : value) ?? 'null';
      const safe = serialized.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      prompt += `<source index="${index + 1}" type="${source.sourceType}" label="${escapeAttribute(source.label)}">${safe}</source>\n`;
    }
    if (prompt.length > config.AI_MAX_INPUT_CHARS) throw new AIIntelligenceError('AI_CONTEXT_TOO_LARGE', 'The bounded grounding context is too large for the configured AI limit.', false, { sourceCount: boundedSources.length, maxChars: config.AI_MAX_INPUT_CHARS });
    const types = new Set(boundedSources.map((source) => source.sourceType));
    const sourceType = types.size === 1 ? boundedSources[0].sourceType : 'mixed';
    return { prompt, sourceType, sourceCount: boundedSources.length, sourceChars: prompt.length };
  }
}

function escapeAttribute(value: string): string { return value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80); }
