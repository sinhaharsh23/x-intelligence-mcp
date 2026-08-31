import { Module } from '@nitrostack/core';
import { IntelligenceService } from './intelligence.service.js';
import { IntelligenceTools } from './intelligence.tools.js';

@Module({ name: 'intelligence', description: 'Deterministic discovery and topic signals over real X data.', controllers: [IntelligenceTools], providers: [IntelligenceService] })
export class IntelligenceModule {}
