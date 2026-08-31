import { ExecutionContext, ResourceDecorator as Resource, Injectable } from '@nitrostack/core';
import { XIntelligenceError } from '../../common/errors/x-errors.js';
import { XService } from './x.service.js';
import { postIdSchema, usernameSchema } from './x.schemas.js';

@Injectable({ deps: [XService] })
export class XResources {
  constructor(private readonly x: XService) {}

  private decodeIdentifier(uri: string): string {
    try {
      return decodeURIComponent(uri.split('/').at(-1) ?? '');
    } catch {
      throw new XIntelligenceError('INVALID_REQUEST', 'The resource identifier is not valid URL encoding.', false);
    }
  }

  @Resource({ uri: 'x://account/me', name: 'Authenticated X Account', description: 'The configured personal X account profile.', mimeType: 'application/json', metadata: { cacheable: true, cacheMaxAge: 30000 } })
  async accountMe(_uri: string, _ctx: ExecutionContext) { return this.x.getMe(); }

  @Resource({ uri: 'x://account/{username}', name: 'X Account by Username', description: 'Resource template for an exact X username lookup.', mimeType: 'application/json', metadata: { cacheable: true, cacheMaxAge: 30000 } })
  async accountByUsername(uri: string, _ctx: ExecutionContext) { const username = this.decodeIdentifier(uri); const parsed = usernameSchema.safeParse(username); if (!parsed.success) throw new XIntelligenceError('INVALID_REQUEST', 'The account resource requires a valid X username.', false); return this.x.getUser({ username: parsed.data }); }

  @Resource({ uri: 'x://post/{id}', name: 'X Post by ID', description: 'Resource template for an X post lookup.', mimeType: 'application/json', metadata: { cacheable: true, cacheMaxAge: 45000 } })
  async postById(uri: string, _ctx: ExecutionContext) { const id = this.decodeIdentifier(uri); if (!postIdSchema.safeParse(id).success) throw new XIntelligenceError('INVALID_REQUEST', 'The post resource requires a numeric X post ID.', false); return this.x.getPost(id); }

  @Resource({ uri: 'x://health', name: 'X Intelligence Health', description: 'Safe server and X API health status.', mimeType: 'application/json', metadata: { cacheable: false } })
  async health(_uri: string, _ctx: ExecutionContext) { return this.x.health(); }

  @Resource({ uri: 'x://capabilities', name: 'X Intelligence Capabilities', description: 'Capabilities derived from current X configuration.', mimeType: 'application/json', metadata: { cacheable: true, cacheMaxAge: 30000 } })
  async capabilities(_uri: string, _ctx: ExecutionContext) { return this.x.getCapabilities(); }

  @Resource({ uri: 'x://rate-limits', name: 'X API Rate Limits', description: 'Rate-limit states observed by the MCP server.', mimeType: 'application/json' })
  async rateLimits(_uri: string, _ctx: ExecutionContext) { return { rates: this.x.getRateLimits() }; }
}
