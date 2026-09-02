import { Injectable, NitroStackServer } from '@nitrostack/core';

type JsonRecord = Record<string, unknown>;
type RequestLike = { method: string; path: string; body?: { method?: string } };
type ResponseLike = { write: WriteLike; end: EndLike };
type ExpressLike = { use: (middleware: (request: RequestLike, response: ResponseLike, next: () => void) => void) => void };

const STANDARD_TOOL_FIELDS = [
  'name',
  'title',
  'description',
  'inputSchema',
  'outputSchema',
  'annotations',
  'execution',
  '_meta',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Keep NitroStack's widget metadata in _meta, but omit legacy non-MCP fields
 * from remote tools/list responses. STDIO and NitroStudio keep the original
 * framework objects; this boundary only affects Streamable HTTP responses.
 */
export function toStandardMcpTool(tool: unknown): JsonRecord {
  if (!isRecord(tool)) return {};
  const standardTool: JsonRecord = {};
  for (const field of STANDARD_TOOL_FIELDS) {
    if (tool[field] !== undefined) standardTool[field] = tool[field];
  }
  return standardTool;
}

export function sanitizeToolsListPayload(payload: unknown): unknown {
  if (!isRecord(payload) || !isRecord(payload.result) || !Array.isArray(payload.result.tools)) return payload;
  return {
    ...payload,
    result: {
      ...payload.result,
      tools: payload.result.tools.map(toStandardMcpTool),
    },
  };
}

/** Supports both valid Streamable HTTP response forms: JSON and SSE. */
export function sanitizeToolsListResponse(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    return JSON.stringify(sanitizeToolsListPayload(parsed));
  } catch {
    const lines = body.split(/\r?\n/);
    return lines.map((line) => {
      if (!line.startsWith('data:')) return line;
      const data = line.slice(5).trim();
      if (!data) return line;
      try {
        const parsed = JSON.parse(data) as unknown;
        const sanitized = sanitizeToolsListPayload(parsed);
        return `data: ${JSON.stringify(sanitized)}`;
      } catch {
        return line;
      }
    }).join('\n');
  }
}

type WriteLike = (chunk: unknown, ...args: unknown[]) => boolean;
type EndLike = (chunk?: unknown, ...args: unknown[]) => unknown;

function chunkToBuffer(chunk: unknown, encoding?: BufferEncoding): Buffer {
  if (typeof chunk === 'string') return Buffer.from(chunk, encoding);
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.alloc(0);
}

/**
 * Install a narrow response boundary before NitroStack's /mcp route. It only
 * buffers tools/list, so normal tool calls, resource reads, SSE GET streams,
 * legacy /sse, and NitroStudio behavior are unchanged.
 */
export function installStandardToolListResponse(app: ExpressLike): void {
  app.use((request, response, next) => {
    if (request.method !== 'POST' || request.path !== '/mcp' || request.body?.method !== 'tools/list') {
      next();
      return;
    }

    const target = response as unknown as { write: WriteLike; end: EndLike };
    const originalWrite = target.write.bind(response) as WriteLike;
    const originalEnd = target.end.bind(response) as EndLike;
    const chunks: Buffer[] = [];

    target.write = ((chunk: unknown, ...args: unknown[]) => {
      chunks.push(chunkToBuffer(chunk, typeof args[0] === 'string' ? args[0] as BufferEncoding : undefined));
      const callback = args.find((value): value is () => void => typeof value === 'function');
      callback?.();
      return true;
    }) as WriteLike;

    target.end = ((chunk?: unknown, ...args: unknown[]) => {
      if (chunk !== undefined && typeof chunk !== 'function') {
        chunks.push(chunkToBuffer(chunk, typeof args[0] === 'string' ? args[0] as BufferEncoding : undefined));
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const sanitized = sanitizeToolsListResponse(body);
      const callback = args.find((value): value is () => void => typeof value === 'function');
      return callback ? originalEnd(Buffer.from(sanitized), callback) : originalEnd(Buffer.from(sanitized));
    }) as EndLike;

    next();
  });
}

@Injectable({ deps: [NitroStackServer] })
export class McpToolCompatibility {
  private installed = false;

  constructor(private readonly server: NitroStackServer) {}

  onApplicationBootstrap(): void {
    if (this.installed) return;
    const app = this.server.getHttpTransport()?.getApp?.();
    if (!app) return;
    installStandardToolListResponse(app);
    this.installed = true;
  }
}
