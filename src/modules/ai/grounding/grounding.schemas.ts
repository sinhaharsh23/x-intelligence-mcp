import { z } from 'zod';

export const groundingMetadataSchema = z.object({
  grounded: z.boolean(),
  sourceType: z.enum(['x_api', 'deterministic_analysis', 'user_input', 'mixed']),
  sourceCount: z.number().int().nonnegative(),
  sourceChars: z.number().int().nonnegative(),
});
