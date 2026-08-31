import { Module } from '@nitrostack/core';
import { AIService } from './ai.service.js';
import { AIRegistry } from './ai.registry.js';
import { AITools } from './ai.tools.js';
import { GroundingService } from './grounding/grounding.service.js';

@Module({ name: 'ai', description: 'Optional provider-independent AI generation and grounded interpretation layer.', controllers: [AITools], providers: [AIRegistry, GroundingService, AIService], exports: [AIService] })
export class AIModule {}
