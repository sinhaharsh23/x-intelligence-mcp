import 'dotenv/config';
import { AIRegistry } from '../dist/modules/ai/ai.registry.js';
import { getConfig } from '../dist/common/config/env.js';

const config = getConfig();
if (!config.AI_ENABLED) {
  console.log(JSON.stringify({ realRequest: false, success: false, code: 'AI_DISABLED', aiEnabled: false }));
  process.exit(0);
}

const provider = new AIRegistry().selected();
if (!provider) {
  console.log(JSON.stringify({ realRequest: false, success: false, code: 'AI_NOT_CONFIGURED', aiEnabled: true, configuredProvider: false }));
  process.exit(0);
}

try {
  const result = await provider.generate({
    systemPrompt: 'Return only the requested short response. Do not include secrets.',
    userPrompt: 'Reply with exactly: GROQ_OK',
    maxOutputTokens: 64,
  });
  console.log(JSON.stringify({ realRequest: true, success: true, provider: result.provider, model: result.model, httpStatus: result.httpStatus, durationMs: result.durationMs, responseLength: result.text.length }));
  process.exit(0);
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : 'AI_PROVIDER_ERROR';
  const details = error && typeof error === 'object' && 'details' in error && error.details && typeof error.details === 'object' ? error.details : {};
  const message = error instanceof Error ? error.message.replace(/^\[[A-Z_]+\]\s*/, '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, 300) : 'The AI provider request failed.';
  console.log(JSON.stringify({
    realRequest: true,
    success: false,
    provider: provider.id,
    model: provider.model,
    code,
    message,
    httpStatus: details.httpStatus,
    providerErrorType: details.providerErrorType,
    providerErrorCode: details.providerErrorCode,
    providerErrorMessage: details.providerErrorMessage,
    responseJsonParsed: details.responseJsonParsed,
    choicesExists: details.choicesExists,
    choicesLength: details.choicesLength,
    messageExists: details.messageExists,
    contentType: details.contentType,
    finishReason: details.finishReason,
  }));
  process.exit(1);
}
