import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('bundled dashboard widget carries its presentation CSS and canvas sizing', async () => {
  const html = await readFile(new URL('../src/widgets/out/dashboard.html', import.meta.url), 'utf8');

  // The NitroStack artifact renders this style element from the bundled
  // React component at runtime, so assert against the generated bundle text.
  assert.match(html, /data-widget-style["']?\s*:\s*["']mcp-dashboard/);
  assert.match(html, /\.mcp-dashboard\s*\{/);
  assert.match(html, /\.mcp-scene\s*\{[^}]*height:min\(52vh,540px\)/);
  assert.match(html, /\.mcp-scene canvas\s*\{[^}]*width:100% !important;[^}]*height:100% !important/);
  assert.match(html, /Interactive MCP neural canvas fallback/);
  assert.match(html, /mcp-neural-2d/);
  assert.match(html, /mcp-neural-edges/);
  assert.match(html, /mcp-fallback-resource/);
  assert.match(html, /MCP NEURAL CANVAS/);
  assert.match(html, /WebGL unavailable; using interactive fallback/);
  assert.match(html, /getContext\(['"]webgl2['"]\)/);
  assert.match(html, /getContext\(['"]webgl['"]\)/);
  assert.doesNotMatch(html, /missing required error components/);
  assert.doesNotMatch(html, /next[\\/]error|next[\\/]router|NextRouter/);
  assert.match(html, /mcp-display-mode-button/);
  assert.match(html, /requestDisplayMode/);
  assert.match(html, /Restore inline widget/);
});
