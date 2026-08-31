#!/usr/bin/env node
import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';
import { assertProductionSecurity } from './common/config/production-security.js';
import { getConfig } from './common/config/env.js';

async function bootstrap(): Promise<void> {
  try {
    console.error('Starting X Intelligence MCP 1.0.0');
    assertProductionSecurity(getConfig());
    const server = await McpApplicationFactory.create(AppModule);
    await server.start();
  } catch (error) {
    console.error('Failed to start X Intelligence MCP:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  }
}

void bootstrap();
