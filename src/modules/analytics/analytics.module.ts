import { Module } from '@nitrostack/core';
import { AnalyticsTools } from './analytics.tools.js';
import { AnalyticsService } from './analytics.service.js';

@Module({ name: 'analytics', description: 'Deterministic analytics over real X data.', controllers: [AnalyticsTools], providers: [AnalyticsService], exports: [AnalyticsService] })
export class AnalyticsModule {}
