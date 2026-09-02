import { Injectable, NitroStackServer } from '@nitrostack/core';

type JsonRecord = Record<string, unknown>;
type LoggerLike = {
  debug: (message: string, meta?: JsonRecord) => void;
  info: (message: string, meta?: JsonRecord) => void;
  warn: (message: string, meta?: JsonRecord) => void;
  error: (message: string, meta?: JsonRecord) => void;
};
type RequestLike = {
  method?: string;
  path?: string;
  body?: unknown;
  auth?: { authenticated?: boolean; scopes?: string[]; tokenInfo?: { aud?: string | string[] } };
  get?: (name: string) => string | undefined;
};
type ResponseLike = {
  statusCode?: number;
  on?: (event: 'finish', listener: () => void) => void;
};
type ExpressLike = { use: (middleware: (request: RequestLike, response: ResponseLike, next: () => void) => void) => void };
type ToolLike = {
  name: string;
  handler: (input: unknown, context: unknown) => Promise<unknown>;
  execute: (input: unknown, context: unknown) => Promise<unknown>;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestDetails(request: RequestLike): JsonRecord {
  const body = isRecord(request.body) ? request.body : {};
  const params = isRecord(body.params) ? body.params : {};
  const args = isRecord(params.arguments) ? params.arguments : {};
  const tokenInfo = request.auth?.tokenInfo;
  const audienceClaim = tokenInfo?.aud;
  return {
    httpMethod: request.method ?? 'unknown',
    path: request.path ?? 'unknown',
    mcpMethod: typeof body.method === 'string' ? body.method : 'unknown',
    toolName: typeof params.name === 'string' ? params.name : undefined,
    argumentKeys: Object.keys(args).sort(),
    sessionIdPresent: Boolean(request.get?.('mcp-session-id')),
    protocolVersion: request.get?.('mcp-protocol-version') ?? 'missing',
    origin: request.get?.('origin') ?? 'missing',
    accept: request.get?.('accept') ?? 'missing',
    contentType: request.get?.('content-type') ?? 'missing',
    authorizationPresent: Boolean(request.get?.('authorization')),
    bearerScheme: request.get?.('authorization')?.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? 'missing',
    authenticationAccepted: request.auth?.authenticated === true,
    audienceValidated: request.auth?.authenticated === true,
    audienceClaimCount: Array.isArray(audienceClaim) ? audienceClaim.length : audienceClaim ? 1 : 0,
    scopes: request.auth?.scopes ?? [],
  };
}

function argumentKeys(input: unknown): string[] {
  return isRecord(input) ? Object.keys(input).sort() : [];
}

function errorCategory(error: unknown): string {
  if (isRecord(error) && typeof error.code === 'string') return error.code;
  return error instanceof Error ? error.name : 'unknown_error';
}

/**
 * Logs the sanitized, post-auth request boundary before the official MCP
 * transport routes the request. It records protocol shape and response status,
 * never credential values or request argument values.
 */
@Injectable({ deps: [NitroStackServer, 'Logger'] })
export class McpBoundaryDiagnostics {
  private installed = false;

  constructor(private readonly server: NitroStackServer, private readonly logger: LoggerLike) {}

  onApplicationBootstrap(): void {
    if (this.installed) return;
    this.installToolTracing();
    const app = this.server.getHttpTransport()?.getApp?.() as ExpressLike | undefined;
    if (!app) return;
    app.use((request, response, next) => {
      const details = requestDetails(request);
      this.logger.info('[MCP-BOUNDARY] request accepted at MCP boundary', details);
      if (details.mcpMethod === 'tools/call') {
        this.logger.info('[MCP-BOUNDARY] tools/call received', details);
        this.logger.info('[MCP-BOUNDARY] schema validation delegated to NitroStack', {
          toolName: details.toolName ?? 'unknown',
          argumentKeys: details.argumentKeys as string[],
        });
      }
      response.on?.('finish', () => {
        this.logger.info('[MCP-BOUNDARY] response completed', {
          mcpMethod: details.mcpMethod,
          toolName: details.toolName ?? 'unknown',
          responseStatus: response.statusCode ?? 0,
        });
      });
      next();
    });
    this.installed = true;
  }

  private installToolTracing(): void {
    const registry = (this.server as unknown as { tools?: Map<string, ToolLike> }).tools;
    if (!registry) return;
    for (const tool of registry.values()) {
      const traced = tool as ToolLike & { __mcpBoundaryTraced?: boolean };
      if (traced.__mcpBoundaryTraced || typeof tool.handler !== 'function') continue;
      const originalHandler = tool.handler;
      traced.handler = async (input, context) => {
        this.logger.info('[MCP-BOUNDARY] handler entered', { toolName: tool.name, argumentKeys: argumentKeys(input) });
        try {
          const result = await originalHandler(input, context);
          this.logger.info('[MCP-BOUNDARY] handler success', { toolName: tool.name });
          return result;
        } catch (error) {
          this.logger.warn('[MCP-BOUNDARY] handler error', { toolName: tool.name, errorCategory: errorCategory(error) });
          throw error;
        }
      };
      traced.__mcpBoundaryTraced = true;
    }
  }
}
