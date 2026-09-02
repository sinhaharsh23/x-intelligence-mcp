'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';
import { MCPScene } from './MCPScene';
import { MCPDashboardStyles } from './MCPDashboardStyles';
import { DEMO_RESOURCES, DEMO_TOOLS, type DashboardTool } from './tool-catalog';
import { ToolDrawer } from './ToolDrawer';

type Dict = Record<string, any>;
function dict(value: unknown): Dict { return value && typeof value === 'object' && !Array.isArray(value) ? value as Dict : {}; }

const resourceTool: Record<string, string> = { 'Account Profile': 'x_get_user', 'Post Card': 'x_get_post', 'Search Dashboard': 'x_search_posts', 'Analytics Dashboard': 'x_analyze_post', 'Health Check': 'x_get_capabilities', 'System Status': 'x_ai_status', 'Composer': 'x_generate_post', 'Widget Examples': 'x_get_capabilities' };

export function MCPDashboard() {
  const sdk = useWidgetSDK();
  const [localDisplayMode, setLocalDisplayMode] = useState<'inline' | 'fullscreen' | 'pip' | null>(null);
  const [displayModeBusy, setDisplayModeBusy] = useState(false);
  const [selected, setSelected] = useState<DashboardTool>();
  const [view, setView] = useState<'3d' | 'grid'>('3d');
  const [query, setQuery] = useState('');
  const [palette, setPalette] = useState(false);
  const [section, setSection] = useState('Canvas');
  const [animated, setAnimated] = useState(true);
  const [busyTool, setBusyTool] = useState('');
  const [lastTool, setLastTool] = useState('');
  const output = dict(sdk.getToolOutput());
  const tools = useMemo(() => { const needle = query.trim().toLowerCase(); return needle ? DEMO_TOOLS.filter((tool) => `${tool.name} ${tool.description} ${tool.category}`.toLowerCase().includes(needle)) : DEMO_TOOLS; }, [query]);
  const callTool = async (name: string, args: Dict = {}) => { setBusyTool(name); setLastTool(name); try { return await sdk.callTool(name, args); } finally { setBusyTool(''); } };
  const openExternal = (url: string) => sdk.openExternal(url);
  const displayMode = localDisplayMode ?? sdk.displayMode ?? sdk.getDisplayMode();
  const isFullscreen = displayMode === 'fullscreen';
  const toggleDisplayMode = async () => {
    if (displayModeBusy) return;
    setDisplayModeBusy(true);
    const nextMode = isFullscreen ? 'inline' : 'fullscreen';
    try {
      const result = await sdk.requestDisplayMode(nextMode);
      setLocalDisplayMode(result?.mode ?? nextMode);
    } catch (error) {
      console.warn('NitroStack display mode request was rejected.', error instanceof Error ? error.message : 'display mode unavailable');
    } finally {
      setDisplayModeBusy(false);
    }
  };

  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(true); } if (event.key === 'Escape') { setPalette(false); setSelected(undefined); if (isFullscreen || sdk.getDisplayMode() === 'fullscreen') void sdk.requestInline().catch(() => undefined); } }; window.addEventListener('keydown', onKey); if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setAnimated(false); return () => window.removeEventListener('keydown', onKey); }, [sdk, isFullscreen]);
  useEffect(() => { if (sdk.displayMode) setLocalDisplayMode(null); }, [sdk.displayMode]);
  const selectTool = (tool: DashboardTool) => { setSelected(tool); setPalette(false); };
  const openResource = (label: string) => { setSection(label); const tool = DEMO_TOOLS.find((item) => item.name === resourceTool[label]); if (tool) setSelected(tool); else setSelected(undefined); };
  const provider = String(output.selectedProvider ?? output.provider ?? 'configured at runtime');
  const capability = dict(output.capabilities);

  return <><MCPDashboardStyles /><main className="mcp-dashboard">
    <aside className="mcp-sidebar"><div className="mcp-brand"><div className="mcp-brand-mark">X</div><div><strong>X INTELLIGENCE</strong><span>MCP COMMAND CENTER</span></div></div><div className="mcp-project"><span>PROJECT</span><b>x-intelligence-mcp</b><div><i /> Connected</div><small>STDIO · NitroStudio bridge</small></div><nav className="mcp-nav" aria-label="Dashboard sections">{['Canvas', 'Tools', 'Resources', 'Prompts', 'Tasks', 'AI Chat', 'Compose', 'Skills', 'Test Cases', 'Health', 'Logs', 'Deployments', 'Authentication'].map((item) => <button type="button" className={section === item ? 'is-active' : ''} key={item} onClick={() => setSection(item)}><span aria-hidden="true">{item === 'Canvas' ? '◈' : item === 'Tools' ? '⌘' : item === 'Resources' ? '◉' : item === 'Health' ? '♥' : item === 'Authentication' ? '◇' : '·'}</span>{item}</button>)}</nav><div className="mcp-sidebar-foot"><span>DEMO SURFACE</span><b>{DEMO_TOOLS.length} tools · {DEMO_RESOURCES.length} resources</b><small>Writes excluded · real reads enabled</small></div></aside>
    <section className="mcp-main"><header className="mcp-topbar"><div><span className="mcp-kicker">{section.toUpperCase()}</span><h1>{section === 'Canvas' ? 'MCP Neural Canvas' : section}</h1></div><div className="mcp-top-actions"><button type="button" className="mcp-search-button" onClick={() => setPalette(true)} aria-label="Open tool search">⌘ K <span>Search tools</span></button><button type="button" className="mcp-secondary-button" onClick={() => setAnimated((value) => !value)}>{animated ? 'Animations on' : 'Animations off'}</button><button type="button" className="mcp-secondary-button" onClick={() => void callTool('x_ai_status')} aria-label="Refresh AI status">Refresh AI</button><button type="button" className="mcp-display-mode-button" onClick={() => void toggleDisplayMode()} disabled={displayModeBusy} aria-label={isFullscreen ? 'Restore inline widget' : 'Expand widget'} aria-pressed={isFullscreen} title={isFullscreen ? 'Restore widget' : 'Expand widget'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" /></svg></button></div></header><div className="mcp-content"><section className="mcp-hero"><div className="mcp-hero-copy"><span className="mcp-kicker cyan">LIVE MCP GRAPH</span><h2>Reality in motion.</h2><p>Real X reads and grounded AI drafts flow through one authenticated NitroStack bridge.</p></div><div className="mcp-view-switch"><button type="button" className={view === '3d' ? 'is-active' : ''} onClick={() => setView('3d')}>3D View</button><button type="button" className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')}>Grid View</button></div></section>{view === '3d' ? <MCPScene tools={tools} resources={DEMO_RESOURCES} selected={selected?.name} onSelect={selectTool} onResourceSelect={openResource} pulse={Boolean(busyTool)} animated={animated}/> : <div className="mcp-tool-grid">{tools.map((tool) => <button type="button" className={`mcp-grid-card ${tool.category.toLowerCase()}`} key={tool.name} onClick={() => selectTool(tool)}><span>{tool.category}</span><b>{tool.name}</b><small>{tool.description}</small><em>Open panel →</em></button>)}</div>}<section className="mcp-lower-grid"><div className="mcp-glass-panel"><div className="mcp-panel-head"><div><span className="mcp-kicker">TELEMETRY</span><h3>System pulse</h3></div><span className="mcp-live"><i />LIVE</span></div><div className="mcp-stats"><div><span>TOOLS</span><b>{DEMO_TOOLS.length}</b></div><div><span>RESOURCES</span><b>{DEMO_RESOURCES.length}</b></div><div><span>AI PROVIDER</span><b>{provider}</b></div><div><span>X MODE</span><b>{String(output.authenticationMode ?? capability.authenticationMode ?? 'App read')}</b></div></div><div className="mcp-flow"><span>USER</span><i /><span>MCP CORE</span><i /><span className={busyTool ? 'is-pulsing' : ''}>{busyTool || lastTool || 'READY'}</span><i /><span>RESULT</span></div>{Object.keys(output).length > 0 && <div className="mcp-runtime-note"><b>Latest host result loaded</b><span>{output.authenticationMode ? `X mode: ${String(output.authenticationMode)}` : output.provider ? `Provider: ${String(output.provider)}` : 'Structured result available'}</span></div>}</div><div className="mcp-glass-panel"><div className="mcp-panel-head"><div><span className="mcp-kicker purple">RESOURCE BUS</span><h3>Presentation resources</h3></div><span className="mcp-count">{DEMO_RESOURCES.length} nodes</span></div><div className="mcp-resource-grid">{DEMO_RESOURCES.map((resource) => <button type="button" key={resource.id} className={`mcp-resource-card ${resource.tone}`} onClick={() => openResource(resource.label)} aria-label={`Open ${resource.label} resource`}><span>◉</span><b>{resource.label}</b><small>{resource.id.replace('ui://widget/next-', '').replace('.html', '')}</small></button>)}</div></div></section></div></section>
    {palette && <div className="mcp-palette-backdrop" role="presentation" onClick={() => setPalette(false)}><section className="mcp-palette" role="dialog" aria-label="Search tools" onClick={(event) => event.stopPropagation()}><div className="mcp-palette-input"><span>⌘ K</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search real Demo tools…" /></div><div className="mcp-palette-results">{tools.map((tool) => <button type="button" key={tool.name} onClick={() => selectTool(tool)}><span className={`mcp-palette-dot ${tool.category.toLowerCase()}`} /><div><b>{tool.name}</b><small>{tool.category} · {tool.description}</small></div><em>↵</em></button>)}{!tools.length && <div className="mcp-empty">No registered Demo tool matches.</div>}</div></section></div>}
    {selected && <ToolDrawer tool={selected} onClose={() => setSelected(undefined)} callTool={callTool} openExternal={openExternal}/>}</main></>;
}
