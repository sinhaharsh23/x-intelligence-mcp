import 'dotenv/config';
import { spawn } from 'node:child_process';

const noArgumentTools = new Set(['x_get_capabilities', 'x_ai_status']);
const expectedPresentationTemplates = {
  x_get_capabilities: 'dashboard',
  x_get_user: 'account-profile',
  x_search_posts: 'search-dashboard',
  x_ai_status: 'system-status',
  x_generate_post: 'composer',
  x_analyze_sentiment: 'analytics-dashboard',
};
const expectedProperties = {
  x_get_user: ['id', 'username'],
  x_get_post: ['postId'],
  x_search_posts: ['query', 'maxResults'],
  x_get_user_posts: ['userId', 'username', 'maxResults'],
  x_get_followers: ['userId', 'username', 'maxResults'],
  x_get_following: ['userId', 'username', 'maxResults'],
  x_get_mentions: ['userId', 'username', 'maxResults'],
  x_analyze_post: ['postId'],
  x_generate_post: ['topic', 'tone'],
  x_generate_thread: ['topic', 'numberOfPosts'],
  x_generate_reply: ['postId', 'postText'],
  x_rewrite_post: ['text', 'goal'],
  x_improve_post: ['text'],
  x_summarize_thread: ['postId', 'maxResults'],
  x_summarize_conversation: ['postId', 'maxResults'],
  x_analyze_sentiment: ['postId', 'postText'],
  x_generate_content_ideas: ['topic', 'numberOfIdeas'],
  x_content_strategy: ['goal', 'userId'],
  x_generate_hashtags: ['topic', 'maxResults'],
};

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function inspectMode({ demo, port }) {
  const childEnv = {
    ...process.env,
    ...(demo ? {} : { DEMO_CANVAS_MODE: 'false' }),
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'development',
    MCP_TRANSPORT_TYPE: 'dual',
    OAUTH_REQUIRED: 'false',
  };
  if (demo) delete childEnv.DEMO_CANVAS_MODE;
  const child = spawn(process.execPath, ['dist/index.js'], { cwd: process.cwd(), env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  let requestId = 0;
  let stdoutBuffer = '';
  const responseWaiters = [];
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (Object.prototype.hasOwnProperty.call(message, 'id')) responseWaiters.shift()?.resolve(message);
      } catch { responseWaiters.shift()?.reject(new Error('STDIO returned invalid JSON.')); }
    }
  });

  async function rpc(method, params = {}) {
    const body = await new Promise((resolve, reject) => {
      responseWaiters.push({ resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params })}\n`);
    });
    if (body.error) throw new Error(body.error.message || `${method} failed`);
    return body.result;
  }
  function notify(method, params = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  try {
    let initialized = false;
    for (let attempt = 0; attempt < 80 && !initialized; attempt += 1) {
      try {
        await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'nitrostudio-schema-audit', version: '1.0.0' } });
        initialized = true;
      } catch (error) {
        if (attempt === 79) throw error;
        await delay(100);
      }
    }
    notify('notifications/initialized');
    await delay(300);
    const toolsResult = await rpc('tools/list');
    const resourcesResult = await rpc('resources/list');
    const promptsResult = await rpc('prompts/list');
    const tools = toolsResult.tools ?? [];
    const resources = resourcesResult.resources ?? [];
    const prompts = promptsResult.prompts ?? [];
    const toolNames = new Set(tools.map((tool) => tool.name));
    const schemaProblems = [];
    const presentationTemplates = {};
    const mappingProblems = [];
    for (const tool of tools) {
      const properties = tool.inputSchema?.properties && typeof tool.inputSchema.properties === 'object' ? Object.keys(tool.inputSchema.properties) : [];
      if (demo && !noArgumentTools.has(tool.name) && properties.length === 0) schemaProblems.push(`${tool.name}: no top-level properties`);
      if (demo) for (const property of expectedProperties[tool.name] ?? []) if (!properties.includes(property)) schemaProblems.push(`${tool.name}: missing ${property}`);
      if (demo && expectedPresentationTemplates[tool.name]) {
        const template = typeof tool.outputTemplate === 'string' ? tool.outputTemplate : tool._meta?.['openai/outputTemplate'];
        presentationTemplates[tool.name] = typeof template === 'string' ? template : null;
        if (typeof template !== 'string' || !template.includes(expectedPresentationTemplates[tool.name])) mappingProblems.push(`${tool.name}: expected ${expectedPresentationTemplates[tool.name]}`);
      }
    }
    const writesPresent = tools.some((tool) => /^(x_create|x_delete|x_reply|x_quote|x_like|x_unlike|x_repost|x_undo|x_follow|x_unfollow|x_upload)/.test(tool.name));
    const argumentFreeTools = tools.filter((tool) => (tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties).length : 0) === 0).map((tool) => tool.name);
    const incorrectlyArgumentFree = argumentFreeTools.filter((name) => !noArgumentTools.has(name));
    const expectedToolCount = demo ? 21 : 67;
    const canvasItems = tools.length + resources.length + prompts.length;
    const logCount = stderr.match(/initialized with \d+ tools, \d+ resources, \d+ prompts/)?.[0] ?? null;
    const result = {
      mode: demo ? 'demo' : 'full',
      stdioChildLoadedProjectEnv: demo ? stderr.includes('NITROSTUDIO_CONFIG::DEMO_CANVAS_MODE=true') : true,
      demoFlagLog: stderr.match(/NITROSTUDIO_CONFIG::DEMO_CANVAS_MODE=(true|false)/)?.[1] ?? null,
      stderrRegistrationSummary: logCount,
      tools: tools.length,
      resources: resources.length,
      prompts: prompts.length,
      canvasItems,
      canvasLimitPass: demo ? canvasItems <= 30 : true,
      expectedToolCountPass: tools.length === expectedToolCount,
      duplicateToolNames: tools.length - toolNames.size,
      schemaProblems,
      presentationTemplates,
      mappingProblems,
      argumentFreeTools,
      incorrectlyArgumentFree,
      toolsWithWidget: tools.filter((tool) => typeof tool.outputTemplate === 'string' || typeof tool._meta?.['openai/outputTemplate'] === 'string').length,
      toolsWithoutWidget: tools.filter((tool) => typeof tool.outputTemplate !== 'string' && typeof tool._meta?.['openai/outputTemplate'] !== 'string').map((tool) => tool.name),
      writesPresent,
      initialTools: tools.filter((tool) => tool._meta?.['tool/initial'] === true).map((tool) => tool.name),
    };
    return { result, ok: result.canvasLimitPass && result.expectedToolCountPass && result.duplicateToolNames === 0 && schemaProblems.length === 0 && mappingProblems.length === 0 && (!demo || (!writesPresent && result.demoFlagLog === 'true' && incorrectlyArgumentFree.length === 0 && result.initialTools.includes('x_get_capabilities'))) };
  } finally {
    child.kill('SIGKILL');
  }
}

const demo = await inspectMode({ demo: true, port: 3201 });
const full = await inspectMode({ demo: false, port: 3202 });
const output = { demo: demo.result, full: full.result, audit: { pass: demo.ok && full.ok, demoSchemaPass: demo.result.schemaProblems.length === 0, demoMappingPass: demo.result.mappingProblems.length === 0, demoCanvasPass: demo.result.canvasLimitPass } };
console.log(JSON.stringify(output, null, 2));
process.exitCode = output.audit.pass ? 0 : 1;
