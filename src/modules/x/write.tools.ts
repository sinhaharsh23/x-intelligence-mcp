import { ExecutionContext, RateLimit, ToolDecorator as Tool, UseGuards, Widget, z, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { confirmSchema, mediaSchema, postCreateSchema, postIdSchema, postTextSchema, userIdSchema } from './x.schemas.js';
import { XService } from './x.service.js';

const confirmedPostSchema = postCreateSchema.and(confirmSchema);
const confirmedMediaPostSchema = z.object({ text: postTextSchema.optional(), media: z.array(mediaSchema).min(1).max(4), replyToPostId: postIdSchema.optional() }).refine((value) => value.text || value.media.length, 'Media is required.').and(confirmSchema);
const confirmedReplyMediaSchema = z.object({ postId: postIdSchema, text: postTextSchema.optional(), media: z.array(mediaSchema).min(1).max(4) }).and(confirmSchema);

@Injectable({ deps: [XService] })
export class XWriteTools {
  constructor(private readonly x: XService) {}

  @Tool({ name: 'x_create_post', description: 'Publish a real X post using the configured personal account. Requires explicit confirm=true.', inputSchema: confirmedPostSchema, annotations: { destructiveHint: false, idempotentHint: false, readOnlyHint: false, openWorldHint: true }, invocation: { invoking: 'Publishing to X…', invoked: 'Published to X' } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget({ route: 'composer', prefersBorder: true })
  async createPost(input: z.infer<typeof postCreateSchema>, _ctx: ExecutionContext) { return this.x.createPost(input); }

  @Tool({ name: 'x_delete_post', description: 'Delete a post owned by the configured X account. This is destructive and requires confirm=true.', inputSchema: z.object({ postId: postIdSchema, ...confirmSchema.shape }), annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false, openWorldHint: true }, invocation: { invoking: 'Deleting the X post…', invoked: 'X post deleted' } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  async deletePost(input: { postId: string; confirm: true }, _ctx: ExecutionContext) { return this.x.deletePost(input.postId); }

  @Tool({ name: 'x_reply_to_post', description: 'Publish a real reply to an X post. Requires explicit confirm=true.', inputSchema: z.object({ postId: postIdSchema, text: postTextSchema, ...confirmSchema.shape }), annotations: { destructiveHint: false, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('composer')
  async replyToPost(input: { postId: string; text: string }, _ctx: ExecutionContext) { return this.x.createPost({ text: input.text, replyToPostId: input.postId }); }

  @Tool({ name: 'x_quote_post', description: 'Publish a real quote post referencing an X post. Requires explicit confirm=true.', inputSchema: z.object({ postId: postIdSchema, text: postTextSchema, ...confirmSchema.shape }), annotations: { destructiveHint: false, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  @Widget('composer')
  async quotePost(input: { postId: string; text: string }, _ctx: ExecutionContext) { return this.x.createPost({ text: input.text, quotePostId: input.postId }); }

  @Tool({ name: 'x_create_thread', description: 'Publish an ordered thread sequentially after explicit confirm=true. If a later post fails, returns partial success without claiming full success.', inputSchema: z.object({ posts: z.array(z.object({ text: postTextSchema })).min(1).max(20), ...confirmSchema.shape }), annotations: { destructiveHint: false, idempotentHint: false, readOnlyHint: false, openWorldHint: true }, invocation: { invoking: 'Publishing thread to X…', invoked: 'Thread publishing finished' } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('composer')
  async createThread(input: { posts: Array<{ text: string }> }, _ctx: ExecutionContext) { return this.x.createThread(input.posts); }

  @Tool({ name: 'x_like_post', description: 'Like an X post from the configured personal account. Requires explicit confirm=true.', inputSchema: z.object({ postId: postIdSchema, ...confirmSchema.shape }), annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  async likePost(input: { postId: string }, _ctx: ExecutionContext) { return this.x.likePost(input.postId); }

  @Tool({ name: 'x_unlike_post', description: 'Remove a like from an X post. This mutation requires confirm=true.', inputSchema: z.object({ postId: postIdSchema, ...confirmSchema.shape }), annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  async unlikePost(input: { postId: string; confirm: true }, _ctx: ExecutionContext) { return this.x.unlikePost(input.postId); }

  @Tool({ name: 'x_repost', description: 'Repost an X post from the configured personal account. Requires explicit confirm=true.', inputSchema: z.object({ postId: postIdSchema, ...confirmSchema.shape }), annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  async repost(input: { postId: string }, _ctx: ExecutionContext) { return this.x.repost(input.postId); }

  @Tool({ name: 'x_undo_repost', description: 'Undo a repost from the configured personal account. This mutation requires confirm=true.', inputSchema: z.object({ postId: postIdSchema, ...confirmSchema.shape }), annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 20, window: '1m' })
  async undoRepost(input: { postId: string; confirm: true }, _ctx: ExecutionContext) { return this.x.undoRepost(input.postId); }

  @Tool({ name: 'x_follow_user', description: 'Follow an X user from the configured personal account. Requires explicit confirm=true.', inputSchema: z.object({ userId: userIdSchema, ...confirmSchema.shape }), annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  async followUser(input: { userId: string }, _ctx: ExecutionContext) { return this.x.followUser(input.userId); }

  @Tool({ name: 'x_unfollow_user', description: 'Unfollow an X user. This mutation requires confirm=true.', inputSchema: z.object({ userId: userIdSchema, ...confirmSchema.shape }), annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 10, window: '1m' })
  async unfollowUser(input: { userId: string; confirm: true }, _ctx: ExecutionContext) { return this.x.unfollowUser(input.userId); }

  @Tool({ name: 'x_upload_media', description: 'Upload one base64-encoded image/video to X using POST /2/media/upload. Requires explicit confirm=true, user context, and media.write.', inputSchema: mediaSchema.and(confirmSchema), annotations: { destructiveHint: false, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  async uploadMedia(input: z.infer<typeof mediaSchema>, _ctx: ExecutionContext) { return this.x.uploadMedia(input); }

  @Tool({ name: 'x_create_post_with_media', description: 'Upload validated media and publish a real X post with it after explicit confirm=true. No upload or post success is simulated.', inputSchema: confirmedMediaPostSchema, annotations: { destructiveHint: false, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('composer')
  async createPostWithMedia(input: { text?: string; media: Array<z.infer<typeof mediaSchema>>; replyToPostId?: string }, _ctx: ExecutionContext) {
    const uploaded = await Promise.all(input.media.map((media) => this.x.uploadMedia(media)));
    return this.x.createPost({ text: input.text, replyToPostId: input.replyToPostId, mediaIds: uploaded.map((item) => item.id) });
  }

  @Tool({ name: 'x_reply_with_media', description: 'Upload validated media and publish a real reply with it after explicit confirm=true.', inputSchema: confirmedReplyMediaSchema, annotations: { destructiveHint: false, readOnlyHint: false, openWorldHint: true } })
  @UseGuards(OAuthGuard)
  @RateLimit({ requests: 5, window: '1m' })
  @Widget('composer')
  async replyWithMedia(input: { postId: string; text?: string; media: Array<z.infer<typeof mediaSchema>> }, _ctx: ExecutionContext) {
    const uploaded = await Promise.all(input.media.map((media) => this.x.uploadMedia(media)));
    return this.x.createPost({ text: input.text, replyToPostId: input.postId, mediaIds: uploaded.map((item) => item.id) });
  }
}
