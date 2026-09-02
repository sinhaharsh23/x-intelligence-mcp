#!/usr/bin/env node
import './common/config/load-env.js';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';
import { assertProductionSecurity } from './common/config/production-security.js';
import { getConfig } from './common/config/env.js';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from './common/compatibility.js';

async function bootstrap(): Promise<void> {
  try {
    console.error(`Starting ${MCP_SERVER_NAME} ${MCP_SERVER_VERSION}`);
    const config = getConfig();
    console.error(`NITROSTUDIO_CONFIG::DEMO_CANVAS_MODE=${config.DEMO_CANVAS_MODE}`);
    assertProductionSecurity(config);
    const server = await McpApplicationFactory.create(AppModule);
    await server.start();
  } catch (error) {
    console.error('Failed to start X Intelligence MCP:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  }
}

void bootstrap();
