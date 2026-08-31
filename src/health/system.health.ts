import { HealthCheck, HealthCheckInterface, HealthCheckResult, Injectable } from '@nitrostack/core';
import { XService } from '../modules/x/x.service.js';

@Injectable({ deps: [XService] })
@HealthCheck({ name: 'system', description: 'MCP and X configuration health check', interval: 30 })
export class SystemHealthCheck implements HealthCheckInterface {
  private readonly startTime = Date.now();
  constructor(private readonly x: XService) {}

  async check(): Promise<HealthCheckResult> {
    const health = await this.x.health();
    const capabilities = await this.x.getCapabilities();
    return { status: health.connectivity === 'up' ? 'up' : 'degraded', message: health.message ?? 'MCP server is healthy.', details: { product: 'X Intelligence MCP', uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000), xConfigured: health.configured, xConnectivity: health.connectivity, authenticated: health.authenticated, authorization: capabilities.authorization, version: '1.0.0' } };
  }
}
