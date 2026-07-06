import React, { useRef, useEffect, useState } from 'react';
import { useStore } from './store';
import { WarehouseEdge } from './types';
import { traceDijkstra } from './utils/dijkstraTracer';

export const WarehouseCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<WarehouseEdge | null>(null);
  
  // Cache of the latest mouse coordinates
  const mouseRef = useRef({ x: -1000, y: -1000 });

  // Read state and actions from the store
  const { 
    toggleJam, 
    selectedPackageId, 
    selectedSourceNodeId, 
    selectedTargetNodeId, 
    setSelectedPackageId 
  } = useStore();

  // Keep references updated for the non-reactive canvas draw loop
  const selectedPackageIdRef = useRef<string | null>(null);
  const selectedSourceNodeIdRef = useRef<string | null>(null);
  const selectedTargetNodeIdRef = useRef<string | null>(null);
  const hoveredEdgeRef = useRef<WarehouseEdge | null>(null);

  useEffect(() => {
    selectedPackageIdRef.current = selectedPackageId;
  }, [selectedPackageId]);

  useEffect(() => {
    selectedSourceNodeIdRef.current = selectedSourceNodeId;
  }, [selectedSourceNodeId]);

  useEffect(() => {
    selectedTargetNodeIdRef.current = selectedTargetNodeId;
  }, [selectedTargetNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let dashOffset = 0;

    // Canvas size (matches viewport grid coordinates)
    const WIDTH = 1020;
    const HEIGHT = 560;
    
    // Scale canvas for high-DPI (Retina) displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${HEIGHT}px`;
    ctx.scale(dpr, dpr);

    /**
     * Calculates distance from point P to line segment AB.
     */
    function getDistanceToSegment(
      px: number, py: number,
      ax: number, ay: number,
      bx: number, by: number
    ) {
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      
      if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
      
      // Projection factor clamped between 0 and 1
      let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      
      return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    }

    // Main animation frame render loop
    const render = () => {
      // 1. Fetch current simulation frame directly from store
      const { nodes, edges, packages } = useStore.getState();

      // Clear with blueprint background color
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      
      // Draw grid lines (40px spacing)
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      for (let x = 0; x < WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }

      // Update flow conveyor dash offset
      dashOffset = (dashOffset - 0.75) % 20;

      // 2. Identify "active pathways" (edges on packages' remaining routes)
      const activeEdges = new Set<string>();
      packages.forEach(pkg => {
        if (pkg.status === 'ARRIVED') return;
        const currentIdx = pkg.currentRouteIndex;
        // Mark the edge the package is currently on
        if (pkg.route[currentIdx] && pkg.route[currentIdx + 1]) {
          activeEdges.add(`${pkg.route[currentIdx]}->${pkg.route[currentIdx + 1]}`);
        }
        // Mark subsequent edges in the planned path
        for (let i = currentIdx + 1; i < pkg.route.length - 1; i++) {
          activeEdges.add(`${pkg.route[i]}->${pkg.route[i + 1]}`);
        }
      });

      // 3. Mouse Hover Detection over Conveyor Edges and Packages
      let currentHovered: WarehouseEdge | null = null;
      const { x: mx, y: my } = mouseRef.current;

      for (const edge of edges) {
        const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
        const targetNode = nodes.find(n => n.id === edge.targetNodeId);
        if (sourceNode && targetNode) {
          const dist = getDistanceToSegment(mx, my, sourceNode.x, sourceNode.y, targetNode.x, targetNode.y);
          if (dist < 12) { // 12px hover tolerance
            currentHovered = edge;
            break;
          }
        }
      }

      let hoveredPkgId: string | null = null;
      for (const pkg of packages) {
        if (pkg.status === 'ARRIVED') continue;
        const dx = mx - pkg.position.x;
        const dy = my - pkg.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 14) { // 14px hover tolerance
          hoveredPkgId = pkg.id;
          break;
        }
      }

      // Update pointer cursor dynamically
      if (hoveredPkgId || currentHovered) {
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = 'crosshair';
      }

      // Safe update of React hover state without triggering re-effects
      if (
        currentHovered?.sourceNodeId !== hoveredEdgeRef.current?.sourceNodeId ||
        currentHovered?.targetNodeId !== hoveredEdgeRef.current?.targetNodeId
      ) {
        hoveredEdgeRef.current = currentHovered;
        setHoveredEdge(currentHovered);
      }

      // 4. Draw Conveyor Belt Edges (Tracks)
      edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
        const targetNode = nodes.find(n => n.id === edge.targetNodeId);
        if (!sourceNode || !targetNode) return;

        const isEdgeHovered = currentHovered && 
          currentHovered.sourceNodeId === edge.sourceNodeId && 
          currentHovered.targetNodeId === edge.targetNodeId;

        const edgeKey = `${edge.sourceNodeId}->${edge.targetNodeId}`;
        const isActive = activeEdges.has(edgeKey);

        // Calculate coordinate differences
        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;

        const trackWidth = 8;

        // Draw track outer casing (conveyor body structure)
        ctx.shadowBlur = 0; // reset shadow
        ctx.strokeStyle = isEdgeHovered ? '#64748b' : '#e2e8f0';
        ctx.lineWidth = trackWidth + 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();

        // Draw track center line (conveyor belt path)
        ctx.lineWidth = trackWidth;
        if (edge.isJammed) {
          // Jammed track (red flashing)
          const flash = Math.floor(Date.now() / 200) % 2 === 0;
          ctx.strokeStyle = flash ? '#ef4444' : '#b91c1c';
          ctx.setLineDash([]);
        } else if (isActive) {
          // Active conveyor carrying packages (emerald green animated flow)
          ctx.strokeStyle = '#10b981';
          ctx.setLineDash([8, 8]);
          ctx.lineDashOffset = dashOffset;
        } else {
          // Idle conveyor (slate blue/gray animated flow)
          ctx.strokeStyle = '#cbd5e1';
          ctx.setLineDash([6, 8]);
          ctx.lineDashOffset = dashOffset * 0.5; // slower idle speed
        }
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash

        // Draw small directional arrow along the conveyor belt center
        const arrowDist = 0.5; // Midpoint
        const ax = sourceNode.x + dx * arrowDist;
        const ay = sourceNode.y + dy * arrowDist;
        
        ctx.fillStyle = edge.isJammed ? '#ffffff' : (isActive ? '#047857' : '#64748b');
        ctx.beginPath();
        ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // 5. Draw Path Preview if custom source and target are selected (Sky Blue glowing line)
      const previewSrc = selectedSourceNodeIdRef.current;
      const previewTgt = selectedTargetNodeIdRef.current;
      if (previewSrc && previewTgt && previewSrc !== 'RANDOM' && previewTgt !== 'RANDOM') {
        const { path } = traceDijkstra(nodes, edges, previewSrc, previewTgt);
        if (path && path.length >= 2) {
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.lineWidth = 10;
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.18)'; // light sky blue glow
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          const startNode = nodes.find(n => n.id === path[0]);
          if (startNode) {
            ctx.moveTo(startNode.x, startNode.y);
            for (let i = 1; i < path.length; i++) {
              const node = nodes.find(n => n.id === path[i]);
              if (node) {
                ctx.lineTo(node.x, node.y);
              }
            }
          }
          ctx.stroke();

          ctx.beginPath();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#0ea5e9'; // sky blue
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -dashOffset * 0.75; // moving opposite direction
          if (startNode) {
            ctx.moveTo(startNode.x, startNode.y);
            for (let i = 1; i < path.length; i++) {
              const node = nodes.find(n => n.id === path[i]);
              if (node) {
                ctx.lineTo(node.x, node.y);
              }
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 6. Draw highlighted route for the selected package (Indigo glowing line)
      const selectedPkgId = selectedPackageIdRef.current;
      if (selectedPkgId) {
        const pkg = packages.find(p => p.id === selectedPkgId);
        if (pkg && pkg.status !== 'ARRIVED') {
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.lineWidth = 12;
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.22)'; // Indigo glow wrapper
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          // Start from current package position
          ctx.moveTo(pkg.position.x, pkg.position.y);
          
          // Connect to all subsequent nodes in its route
          for (let i = pkg.currentRouteIndex + 1; i < pkg.route.length; i++) {
            const node = nodes.find(n => n.id === pkg.route[i]);
            if (node) {
              ctx.lineTo(node.x, node.y);
            }
          }
          ctx.stroke();

          // Draw the actual path line
          ctx.beginPath();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#6366f1'; // Solid indigo line
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = dashOffset;
          ctx.moveTo(pkg.position.x, pkg.position.y);
          for (let i = pkg.currentRouteIndex + 1; i < pkg.route.length; i++) {
            const node = nodes.find(n => n.id === pkg.route[i]);
            if (node) {
              ctx.lineTo(node.x, node.y);
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 7. Draw Warehouse Nodes (Stations)
      nodes.forEach(node => {
        let nodeColor = '#64748b'; // default junction
        let glowColor = 'rgba(100, 116, 139, 0.2)';
        let symbol = '⛶';

        if (node.type === 'ENTRY') {
          nodeColor = '#3b82f6'; // blue
          glowColor = 'rgba(59, 130, 246, 0.25)';
          symbol = '📥';
        } else if (node.type === 'MERGE') {
          nodeColor = '#a855f7'; // purple
          glowColor = 'rgba(168, 85, 247, 0.25)';
          symbol = '⇄';
        } else if (node.type === 'TERMINAL') {
          nodeColor = '#10b981'; // emerald green
          glowColor = 'rgba(16, 185, 129, 0.25)';
          symbol = '📦';
        }

        // Draw glow ring if node is selected as spawn source/destination
        const isSpawnSrc = node.id === previewSrc;
        const isSpawnTgt = node.id === previewTgt;
        if (isSpawnSrc || isSpawnTgt) {
          ctx.strokeStyle = '#0ea5e9'; // Sky blue border highlight
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 23, 0, Math.PI * 2);
          ctx.stroke();
          glowColor = 'rgba(14, 165, 233, 0.35)';
        }

        // Draw node glow ring
        ctx.shadowColor = nodeColor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // Reset shadow

        // Draw inner circular container
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = nodeColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw central symbol
        ctx.font = '14px Outfit, sans-serif';
        ctx.fillStyle = nodeColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, node.x, node.y + 0.5);

        // Draw station identifier labels
        ctx.font = 'bold 12px Outfit, sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(node.id, node.x, node.y - 25);
        
        ctx.font = '500 9px Outfit, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(node.label, node.x, node.y + 27);
      });

      // 8. Draw Packages
      packages.forEach(pkg => {
        if (pkg.status === 'ARRIVED') return;

        let pkgColor = '#64748b'; // standard
        let strokeColor = '#475569';
        let detailColor = '#e2e8f0';

        if (pkg.type === 'EXPRESS') {
          pkgColor = '#f97316'; // orange glow
          strokeColor = '#c2410c';
          detailColor = '#ffedd5';
          
          // Draw express glowing trail
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 8;
        } else if (pkg.type === 'FRAGILE') {
          pkgColor = '#ca8a04'; // amber/wood
          strokeColor = '#854d0e';
          detailColor = '#fef9c3';
        } else {
          // Standard
          pkgColor = '#3b82f6'; // blue
          strokeColor = '#1d4ed8';
          detailColor = '#dbeafe';
        }

        // Draw express motion blur trail *before* package body
        if (pkg.type === 'EXPRESS') {
          const currentNode = nodes.find(n => n.id === pkg.route[pkg.currentRouteIndex]);
          const nextNode = nodes.find(n => n.id === pkg.route[pkg.currentRouteIndex + 1]);
          if (currentNode && nextNode) {
            const dx = nextNode.x - currentNode.x;
            const dy = nextNode.y - currentNode.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              const vx = dx / len;
              const vy = dy / len;
              // Draw 3 fading trail segments
              for (let i = 1; i <= 3; i++) {
                ctx.fillStyle = `rgba(249, 115, 22, ${0.45 - i * 0.12})`;
                ctx.beginPath();
                ctx.arc(pkg.position.x - vx * (i * 7), pkg.position.y - vy * (i * 7), 7 - i, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }

        // Check if this package is hovered or selected
        const isSelected = pkg.id === selectedPkgId;
        const isHovered = pkg.id === hoveredPkgId;

        // Draw selection rings BEFORE package body so it looks layered
        if (isSelected) {
          ctx.strokeStyle = '#4f46e5'; // Indigo selection halo
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pkg.position.x, pkg.position.y, 14, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.shadowColor = '#4f46e5';
          ctx.shadowBlur = 10;
        } else if (isHovered) {
          ctx.strokeStyle = '#94a3b8'; // slate hover halo
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pkg.position.x, pkg.position.y, 13, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw package body
        ctx.fillStyle = pkgColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        
        const size = 16;
        const px = pkg.position.x - size / 2;
        const py = pkg.position.y - size / 2;
        
        // Rounded package rect
        ctx.beginPath();
        const r = 3; // border radius
        ctx.moveTo(px + r, py);
        ctx.lineTo(px + size - r, py);
        ctx.quadraticCurveTo(px + size, py, px + size, py + r);
        ctx.lineTo(px + size, py + size - r);
        ctx.quadraticCurveTo(px + size, py + size, px + size - r, py + size);
        ctx.lineTo(px + r, py + size);
        ctx.quadraticCurveTo(px, py + size, px, py + size - r);
        ctx.lineTo(px, py + r);
        ctx.quadraticCurveTo(px, py, px + r, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

        // Draw strapping tape design or icon based on type
        if (pkg.type === 'STANDARD') {
          ctx.strokeStyle = detailColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + size / 2, py);
          ctx.lineTo(px + size / 2, py + size);
          ctx.moveTo(px, py + size / 2);
          ctx.lineTo(px + size, py + size / 2);
          ctx.stroke();

          // Draw package name/label
          ctx.font = 'bold 7px Courier New, monospace';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(pkg.id.substring(4, 7), pkg.position.x, pkg.position.y + 2.5);
        } else if (pkg.type === 'EXPRESS') {
          // Draw lightning emblem
          ctx.font = 'bold 10px Outfit, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡', pkg.position.x, pkg.position.y + 0.5);
        } else if (pkg.type === 'FRAGILE') {
          // Draw protective dashed outer bubble ring
          ctx.strokeStyle = 'rgba(202, 138, 4, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.arc(pkg.position.x, pkg.position.y, 13, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw fragile wine glass logo
          ctx.font = '9px Outfit, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🍷', pkg.position.x, pkg.position.y + 0.5);
        }

        // If package is WAITING/Stuck, draw warning exclamation overlay
        if (pkg.status === 'WAITING') {
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pkg.position.x + 8, pkg.position.y - 8, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px Outfit, sans-serif';
          ctx.fillText('!', pkg.position.x + 8, pkg.position.y - 7.5);
        }
      });

      // 9. Loop Frame
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Clean up animation on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []); // Run exactly once on mount, maintaining smooth stutter-free animations

  // Handle Mouse Move over Canvas to update cursor coordinates
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Translate mouse relative to canvas scale dimensions
    const scaleX = canvas.width / (window.devicePixelRatio || 1) / rect.width;
    const scaleY = canvas.height / (window.devicePixelRatio || 1) / rect.height;

    mouseRef.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // Handle Mouse Leave
  const handleMouseLeave = () => {
    mouseRef.current = { x: -1000, y: -1000 };
    setHoveredEdge(null);
  };

  // Handle click on canvas: selects packages or toggles conveyor jams
  const handleCanvasClick = () => {
    const { nodes, edges, packages } = useStore.getState();
    const { x: mx, y: my } = mouseRef.current;

    // 1. Check if clicked on a package (within 14px tolerance)
    let clickedPackageId: string | null = null;
    for (const pkg of packages) {
      if (pkg.status === 'ARRIVED') continue;
      const dx = mx - pkg.position.x;
      const dy = my - pkg.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 14) {
        clickedPackageId = pkg.id;
        break;
      }
    }

    if (clickedPackageId) {
      setSelectedPackageId(clickedPackageId);
      return;
    }

    // 2. Check if clicked on an edge (toggle jam)
    let clickedEdge: WarehouseEdge | null = null;
    
    // Helper to calculate distance to line segment
    const getDistanceToSegment = (
      px: number, py: number,
      ax: number, ay: number,
      bx: number, by: number
    ) => {
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
      let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    };

    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
      const targetNode = nodes.find(n => n.id === edge.targetNodeId);
      if (sourceNode && targetNode) {
        const dist = getDistanceToSegment(mx, my, sourceNode.x, sourceNode.y, targetNode.x, targetNode.y);
        if (dist < 12) {
          clickedEdge = edge;
          break;
        }
      }
    }

    if (clickedEdge) {
      toggleJam(clickedEdge.sourceNodeId, clickedEdge.targetNodeId, !clickedEdge.isJammed);
      return;
    }

    // 3. Clicked background - clear package selection
    setSelectedPackageId(null);
  };

  return (
    <div className="relative blueprint-card rounded-2xl p-4 flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          <h3 className="font-semibold text-slate-800 text-sm tracking-wide uppercase">
            Simulation Viewport (1020 × 560 px)
          </h3>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-sm bg-slate-300"></span>
            <span>Idle Conveyor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-sm bg-emerald-500"></span>
            <span>Active Path</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-sm bg-red-500 animate-pulse"></span>
            <span>Jammed Line</span>
          </div>
          <div className="text-slate-400">|</div>
          <span className="italic">Click conveyor to toggle jam | Click package to inspect route</span>
        </div>
      </div>

      <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
          className="block"
        />

        {/* Hover Conveyor Overlay Details */}
        {hoveredEdge && (
          <div 
            className="absolute z-10 pointer-events-none blueprint-card rounded-lg px-2.5 py-1.5 text-xs text-slate-700 shadow-md flex flex-col gap-0.5 border border-slate-300/50"
            style={{
              left: `${Math.min(mouseRef.current.x + 15, 850)}px`,
              top: `${Math.min(mouseRef.current.y + 15, 480)}px`
            }}
          >
            <div className="font-bold text-slate-900">
              Conveyor segment: {hoveredEdge.sourceNodeId} ➔ {hoveredEdge.targetNodeId}
            </div>
            <div>Transit weight: <span className="font-mono">{hoveredEdge.weight}</span></div>
            <div>
              Status: {' '}
              <span className={`font-semibold ${hoveredEdge.isJammed ? 'text-red-500' : 'text-emerald-500'}`}>
                {hoveredEdge.isJammed ? '🔴 JAMMED (Infinity weight)' : '🟢 ACTIVE (Clear)'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 italic mt-0.5">Click to toggle jam status</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WarehouseCanvas;
