import { z } from 'zod';

export const userIdSchema = z.string().regex(/^\d+$/, 'User ID must contain digits only.');
export const postIdSchema = z.string().regex(/^\d+$/, 'Post ID must contain digits only.');
export const usernameSchema = z.string().trim().regex(/^@?[A-Za-z0-9_]{1,15}$/, 'Username must be 1–15 letters, numbers, or underscores.').transform((value) => value.replace(/^@/, ''));
export const paginationSchema = z.object({ maxResults: z.number().int().min(10).max(100).default(25), paginationToken: z.string().max(512).optional() });
export const dateRangeSchema = z.object({ startTime: z.string().datetime().optional(), endTime: z.string().datetime().optional() }).refine((value) => !value.startTime || !value.endTime || value.startTime <= value.endTime, 'startTime must be before endTime.');
export const searchSchema = z.object({
  query: z.string().trim().min(1).max(512),
  username: usernameSchema.optional(),
  hashtag: z.string().trim().regex(/^#?[A-Za-z0-9_]{1,100}$/).transform((value) => value.replace(/^#/, '')).optional(),
  language: z.string().trim().regex(/^[A-Za-z]{2,3}$/).optional(),
  excludeReposts: z.boolean().default(false),
  excludeReplies: z.boolean().default(false),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  maxResults: z.number().int().min(10).max(100).default(25),
  paginationToken: z.string().max(512).optional(),
}).refine((value) => !value.startTime || !value.endTime || value.startTime <= value.endTime, 'startTime must be before endTime.');
export const confirmSchema = z.object({ confirm: z.literal(true, { errorMap: () => ({ message: 'Set confirm to true to authorize this real X mutation.' }) }) });
export const postTextSchema = z.string().trim().min(1).max(280);
export const mediaSchema = z.object({
  data: z.string().min(4).max(20_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/bmp', 'image/webp', 'image/pjpeg', 'image/tiff', 'image/gif', 'video/mp4', 'text/srt', 'text/vtt']),
  mediaCategory: z.enum(['tweet_image', 'tweet_gif', 'tweet_video', 'amplify_video']).default('tweet_image'),
  altText: z.string().max(1000).optional(),
});
export const postCreateSchema = z.object({ text: postTextSchema.optional(), replyToPostId: postIdSchema.optional(), quotePostId: postIdSchema.optional(), mediaIds: z.array(z.string().min(1)).max(4).optional() }).refine((value) => value.text || value.mediaIds?.length, 'A post needs text or media.').refine((value) => !(value.replyToPostId && value.quotePostId), 'A post cannot be both a reply and a quote in this tool.');
