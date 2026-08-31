import { Module } from '@nitrostack/core';
import { XAccountTools } from './account.tools.js';
import { XMetaTools } from './meta.tools.js';
import { XPostReadTools } from './post-read.tools.js';
import { XPrompts } from './x.prompts.js';
import { XResources } from './x.resources.js';
import { XService } from './x.service.js';
import { XWriteTools } from './write.tools.js';
import { XOAuthService } from './x-oauth.service.js';
import { XOAuthTokenStore } from './x-oauth.store.js';
import { XOAuthTools } from './x-oauth.tools.js';

@Module({
  name: 'x',
  description: 'X Intelligence MCP access to the official X API v2.',
  controllers: [XAccountTools, XPostReadTools, XWriteTools, XMetaTools, XResources, XPrompts, XOAuthTools],
  providers: [XOAuthTokenStore, XService, XOAuthService],
  exports: [XService],
})
export class XModule {}
