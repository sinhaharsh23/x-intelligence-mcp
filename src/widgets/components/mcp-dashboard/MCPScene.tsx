'use client';

import { Html, Line, OrbitControls, Sparkles, Torus, Float } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef, type CSSProperties } from 'react';
import type { DashboardTool } from './tool-catalog';
import * as THREE from 'three';

function Core({ pulse }: { pulse: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => { if (ref.current) { ref.current.rotation.x += delta * 0.18; ref.current.rotation.y += delta * 0.25; } });
  return <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.35}><group><mesh ref={ref}><icosahedronGeometry args={[1.2, 1]} /><meshStandardMaterial color="#16d9ff" emissive="#0875ff" emissiveIntensity={pulse ? 3.5 : 1.7} metalness={0.8} roughness={0.2} wireframe /></mesh><mesh scale={0.72}><icosahedronGeometry args={[1.2, 1]} /><meshStandardMaterial color="#07152e" emissive="#072d70" emissiveIntensity={1.2} metalness={0.6} roughness={0.18} /></mesh><Torus args={[1.55, 0.018, 8, 96]} rotation={[Math.PI / 2, 0, 0]}><meshBasicMaterial color="#21e6ff" transparent opacity={0.8} /></Torus><Torus args={[1.8, 0.012, 8, 96]} rotation={[0.3, 0.6, 0]}><meshBasicMaterial color="#9b6cff" transparent opacity={0.65} /></Torus><Html center distanceFactor={8}><div className="mcp-core-label"><strong>X</strong><span>X INTELLIGENCE</span><small>MCP CORE</small></div></Html></group></Float>;
}

function ToolOrb({ tool, index, total, selected, onSelect }: { tool: DashboardTool; index: number; total: number; selected: boolean; onSelect: () => void }) {
  const angle = (index / total) * Math.PI * 2;
  const radius = tool.category === 'AI' ? 3.65 : tool.category === 'STATUS' ? 2.65 : 3.05;
  const position: [number, number, number] = [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, Math.sin(angle) * radius * 0.45];
  const color = tool.category === 'AI' ? '#28d8ff' : tool.category === 'STATUS' ? '#73f7b2' : '#8e73ff';
  return <group position={position}><Line points={[[0, 0, 0], [-position[0], -position[1], -position[2]]]} color={color} transparent opacity={selected ? 0.9 : 0.28} lineWidth={selected ? 2 : 1} dashed dashSize={0.08} gapSize={0.12} /><Html center distanceFactor={7}><button type="button" aria-label={`Open ${tool.name}`} className={`mcp-node mcp-node-${tool.category.toLowerCase()}${selected ? ' is-selected' : ''}`} onClick={onSelect} style={{ '--node-color': color } as CSSProperties}><span className="mcp-node-dot" /><b>{tool.name}</b><small>{tool.presentation}</small></button></Html></group>;
}

export function MCPScene({ tools, selected, onSelect, pulse, animated }: { tools: DashboardTool[]; selected?: string; onSelect: (tool: DashboardTool) => void; pulse: boolean; animated: boolean }) {
  const stars = useMemo(() => Array.from({ length: 90 }, (_, index) => ({ key: index })), []);
  return <div className="mcp-scene"><Canvas camera={{ position: [0, 0, 11], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }} frameloop={animated ? 'always' : 'demand'}><ambientLight intensity={0.38} /><pointLight position={[0, 2, 4]} color="#20d9ff" intensity={18} distance={12} /><pointLight position={[-4, -2, 1]} color="#995cff" intensity={12} distance={10} /><Sparkles count={90} scale={[12, 7, 6]} size={1.8} speed={animated ? 0.3 : 0} color="#7deaff" /><Core pulse={pulse} />{tools.map((tool, index) => <ToolOrb key={tool.name} tool={tool} index={index} total={tools.length} selected={selected === tool.name} onSelect={() => onSelect(tool)} />)}<OrbitControls enablePan={false} minDistance={7} maxDistance={15} enableDamping dampingFactor={0.08} autoRotate={animated} autoRotateSpeed={0.18} /></Canvas></div>;
}
