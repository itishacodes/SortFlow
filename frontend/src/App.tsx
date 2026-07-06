import React, { useState } from 'react';
import { useStore } from './store';
import { WarehouseCanvas } from './WarehouseCanvas';
import { PackageType } from './types';
import { traceDijkstra } from './utils/dijkstraTracer';

export const App: React.FC = () => {
  const {
    isConnected,
    packages,
    nodes,
    edges,
    stats,
    tickRateMs,
    logs,
    manualSpawn,
    clearAllJams,
    changeTickRate,
    resetSimulation,
    selectedPackageId,
    selectedSourceNodeId,
    selectedTargetNodeId,
    setSelectedPackageId,
    setSelectedSourceNodeId,
    setSelectedTargetNodeId,
    autoSpawnEnabled,
    toggleAutoSpawn
  } = useStore();

  const [selectedSpawnType, setSelectedSpawnType] = useState<PackageType>('STANDARD');
  const [activeTab, setActiveTab] = useState<'logs' | 'explainer'>('logs');

  // Helper to calculate average transit time
  const avgTransitTime = stats.totalProcessed > 0
    ? ((stats.totalTransitTime / stats.totalProcessed) / 1000).toFixed(2)
    : '0.00';

  // Find the currently inspected package
  const selectedPkg = selectedPackageId ? packages.find(p => p.id === selectedPackageId) : null;

  // Determine trace parameters for Dijkstra Explainer
  let tracerStart: string | null = null;
  let tracerEnd: string | null = null;
  let tracerLabel = '';

  if (selectedPkg && selectedPkg.status !== 'ARRIVED') {
    tracerStart = selectedPkg.route[selectedPkg.currentRouteIndex];
    tracerEnd = selectedPkg.targetNodeId;
    tracerLabel = `Inspecting Package: ${selectedPkg.id} (Dynamic route from station ${tracerStart} to terminal ${tracerEnd})`;
  } else if (selectedSourceNodeId && selectedTargetNodeId && selectedSourceNodeId !== 'RANDOM' && selectedTargetNodeId !== 'RANDOM') {
    tracerStart = selectedSourceNodeId;
    tracerEnd = selectedTargetNodeId;
    tracerLabel = `Dijkstra Route Preview (From gate ${tracerStart} to terminal ${tracerEnd})`;
  }

  // Calculate live Dijkstra trace
  const traceResult = (tracerStart && tracerEnd)
    ? traceDijkstra(nodes, edges, tracerStart, tracerEnd)
    : null;

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-[1600px] mx-auto gap-6 select-none">
      
      {/* Header Bar */}
      <header className="blueprint-card rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">📦</span>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2.5">
                SortFlow
              </h1>
              <p className="text-sm font-medium text-slate-500 mt-0.5">
                Real-Time Automated Warehouse Sortation Simulation
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 self-stretch sm:self-auto justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-3.5 h-3.5 rounded-full relative flex`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </span>
            <span className="text-sm font-bold text-slate-700">
              {isConnected ? 'Simulation Server Connected' : 'Simulation Offline'}
            </span>
          </div>


        </div>
      </header>

      {/* Main Grid Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        
        {/* Left Side: Viewport & Event Log / Explainer (Span 3 Columns) */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          {/* Canvas Viewport */}
          <WarehouseCanvas />

          {/* Tabbed Panel: Log Ledger vs. Dijkstra Explainer */}
          <div className="blueprint-card rounded-2xl p-5 flex flex-col gap-3 min-h-[260px]">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`pb-2 text-sm font-bold uppercase tracking-wide border-b-2 transition-all cursor-pointer ${
                    activeTab === 'logs'
                      ? 'border-slate-800 text-slate-800'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Simulation Ledger
                </button>
                <button
                  onClick={() => setActiveTab('explainer')}
                  className={`pb-2 text-sm font-bold uppercase tracking-wide border-b-2 transition-all cursor-pointer ${
                    activeTab === 'explainer'
                      ? 'border-slate-800 text-slate-800'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Dijkstra Explainer
                </button>
              </div>
              
              {activeTab === 'logs' ? (
                <button 
                  onClick={resetSimulation}
                  className="text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 border border-slate-200 hover:border-red-200 px-2 py-1 rounded-md transition-all font-medium cursor-pointer"
                >
                  Clear Logs & Reset Stats
                </button>
              ) : (
                <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Pathfinder Node Graph
                </span>
              )}
            </div>

            {activeTab === 'logs' ? (
              <div className="flex flex-col gap-1.5 h-[190px] overflow-y-auto font-mono text-xs pr-2 select-text">
                {logs.length === 0 ? (
                  <div className="text-slate-400 text-center py-10 italic">
                    Simulation initialized. Waiting for events...
                  </div>
                ) : (
                  logs.map((log) => {
                    let badgeColor = 'bg-slate-100 text-slate-600 border-slate-200';
                    if (log.type === 'success') badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    if (log.type === 'warning') badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                    if (log.type === 'error') badgeColor = 'bg-red-50 text-red-700 border-red-200';

                    return (
                      <div 
                        key={log.id} 
                        className={`flex gap-3 items-start py-1 px-2 rounded border border-transparent hover:bg-slate-50/50 hover:border-slate-200/50 transition-all`}
                      >
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">{log.timestamp}</span>
                        <span className={`px-1.5 py-0.25 text-[10px] font-bold rounded uppercase tracking-wider shrink-0 border ${badgeColor}`}>
                          {log.type}
                        </span>
                        <span className="text-slate-700 font-medium text-xs break-words">{log.message}</span>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="h-[190px] overflow-y-auto text-xs pr-2 flex flex-col gap-3 select-text">
                {traceResult ? (
                  <div className="flex flex-col gap-3">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                      <div className="font-bold text-indigo-900 mb-1">{tracerLabel}</div>
                      <div className="flex items-center gap-1.5 flex-wrap font-mono mt-1 text-slate-700">
                        <span className="font-bold text-indigo-600">Optimal Path:</span>
                        {traceResult.path ? (
                          traceResult.path.map((nodeId, idx) => (
                            <React.Fragment key={idx}>
                              <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-bold">{nodeId}</span>
                              {idx < traceResult.path!.length - 1 && <span>➔</span>}
                            </React.Fragment>
                          ))
                        ) : (
                          <span className="text-red-500 font-extrabold">🚨 No path exists (Destination Unreachable)</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                        Pathfinder Execution Step Log
                      </h4>
                      {traceResult.steps.map((step, idx) => (
                        <div key={idx} className="border border-slate-200/60 rounded-lg p-2.5 bg-slate-50/40 flex flex-col gap-2">
                          <div className="flex justify-between items-center font-bold text-slate-800 border-b border-slate-100 pb-1.5">
                            <span>
                              Step {idx + 1}: {step.currentNodeId ? `Select node "${step.currentNodeId}"` : 'End search'}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              dist: {step.minDistance === Infinity ? '∞' : step.minDistance}
                            </span>
                          </div>
                          
                          <div className="text-[11px] text-slate-600">
                            {step.relaxationLogs.map((log, logIdx) => (
                              <div key={logIdx} className="flex gap-1.5 items-start mt-0.5">
                                <span className="text-slate-400">•</span>
                                <span>{log}</span>
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-1.5 pt-2 border-t border-slate-100 text-[10px] font-mono">
                            <div>
                              <span className="font-bold text-slate-500">Distances Table:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(step.distances).map(([nodeId, dist]) => (
                                  <span key={nodeId} className="bg-white border border-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                    {nodeId}:{dist === Infinity ? '∞' : dist}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="font-bold text-slate-500">Unvisited Set:</span>
                              <div className="flex flex-wrap gap-1 mt-1 text-slate-400">
                                {step.unvisited.map(nodeId => (
                                  <span key={nodeId} className="bg-white border border-slate-100 px-1.5 py-0.5 rounded">
                                    {nodeId}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500 gap-2">
                    <span className="text-3xl text-indigo-300">🧭</span>
                    <div className="font-bold text-slate-700">Dijkstra Pathfinder Inspector</div>
                    <p className="text-slate-400 max-w-md text-[11px] mt-0.5 leading-relaxed">
                      Select any active package on the canvas grid to trace its dynamic Dijkstra routing logic. 
                      Alternatively, select a specific Source Gate and Destination Terminal above to preview and inspect the step-by-step path calculation before spawning.
                    </p>
                    <div className="bg-slate-100/60 border border-slate-200/50 rounded-lg p-2.5 max-w-md text-left text-[10px] font-mono mt-3 leading-relaxed">
                      <div className="font-bold text-slate-600 mb-1">Dijkstra Rule Engine Summary:</div>
                      - Nodes = Vertices (Gates, Junctions, Merges, Docks)<br />
                      - Conveyors = Directed Edges with weights (physical travel distance)<br />
                      - Jammed lines = Weights set to <span className="font-bold text-red-500">∞</span> (ignored by relaxation loop)
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Dashboards, Statistics & Controllers (Span 1 Column) */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          
          {/* Real-time System Statistics */}
          <div className="blueprint-card rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase border-b border-slate-200 pb-2.5">
              Live Systems Metrics
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 flex flex-col">
                <span className="text-xs text-slate-500 font-medium">In Transit</span>
                <span className="text-2xl font-black text-slate-800 mt-1 font-mono">
                  {stats.activePackages}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">packages on line</span>
              </div>

              <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 flex flex-col">
                <span className="text-xs text-slate-500 font-medium">Completed</span>
                <span className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                  {stats.totalProcessed}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">sorted cargo items</span>
              </div>

              <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 flex flex-col">
                <span className="text-xs text-slate-500 font-medium">Throughput</span>
                <span className="text-2xl font-black text-indigo-600 mt-1 font-mono">
                  {stats.throughput}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">packages / minute</span>
              </div>

              <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 flex flex-col">
                <span className="text-xs text-slate-500 font-medium">Avg Transit</span>
                <span className="text-2xl font-black text-slate-800 mt-1 font-mono">
                  {avgTransitTime}s
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">seconds per sorting</span>
              </div>
            </div>

            <div className="bg-red-50/40 border border-red-100 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🚨</span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-red-800">Conveyor Blockages</span>
                  <span className="text-[10px] text-red-600">Active line jams detected</span>
                </div>
              </div>
              <span className={`text-xl font-black font-mono ${stats.jamsCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {stats.jamsCount}
              </span>
            </div>
          </div>

          {/* Interactive Spawner & Controls */}
          <div className="blueprint-card rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase border-b border-slate-200 pb-2.5">
              Conveyor Control Center
            </h3>

            {/* Manual Spawner */}
            <div className="flex flex-col gap-2.5">
              <label className="text-xs font-bold text-slate-600">
                Generate Package Payload
              </label>
              
              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                {(['STANDARD', 'EXPRESS', 'FRAGILE'] as PackageType[]).map((t) => {
                  const selected = selectedSpawnType === t;
                  let selectedClass = 'bg-white text-slate-800 shadow-sm border border-slate-200';
                  if (selected) {
                    if (t === 'STANDARD') selectedClass = 'bg-blue-600 text-white shadow-md border border-blue-600';
                    else if (t === 'EXPRESS') selectedClass = 'bg-orange-500 text-white shadow-md border border-orange-500 shadow-orange-200';
                    else if (t === 'FRAGILE') selectedClass = 'bg-amber-600 text-white shadow-md border border-amber-600';
                  }
                  return (
                    <button
                      key={t}
                      onClick={() => setSelectedSpawnType(t)}
                      className={`text-[10px] py-1.5 font-bold rounded-md transition-all cursor-pointer ${
                        selected 
                          ? selectedClass 
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Dynamic details for the selected package type */}
              <div className="text-[11px] text-slate-500 bg-slate-50/50 border border-slate-200/60 rounded-lg p-2 flex flex-col gap-1">
                {selectedSpawnType === 'STANDARD' && (
                  <>
                    <div className="font-bold text-blue-600 flex items-center gap-1">
                      <span>🔵 Standard Priority Box</span>
                    </div>
                    <div>• Speed: <span className="font-mono font-bold text-slate-700">4.0 px/tick</span> (Moderate)</div>
                    <div>• Visuals: Classic blue parcel with white cross strap.</div>
                  </>
                )}
                {selectedSpawnType === 'EXPRESS' && (
                  <>
                    <div className="font-bold text-orange-600 flex items-center gap-1">
                      <span>⚡ Express High-Priority Parcel</span>
                    </div>
                    <div>• Speed: <span className="font-mono font-bold text-slate-700">9.0 px/tick</span> (Hyper-Fast)</div>
                    <div>• Visuals: Orange capsule with lightning emblem and glowing movement trail.</div>
                  </>
                )}
                {selectedSpawnType === 'FRAGILE' && (
                  <>
                    <div className="font-bold text-amber-600 flex items-center gap-1">
                      <span>🍷 Fragile Care Package</span>
                    </div>
                    <div>• Speed: <span className="font-mono font-bold text-slate-700">1.5 px/tick</span> (Slow & Safe)</div>
                    <div>• Visuals: Amber parcel with protective outer bubble ring and glass icon.</div>
                  </>
                )}
              </div>

              {/* Source Node Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Source Station</span>
                <select 
                  value={selectedSourceNodeId || 'RANDOM'}
                  onChange={(e) => setSelectedSourceNodeId(e.target.value === 'RANDOM' ? null : e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <option value="RANDOM">🎲 Random Entry Gate</option>
                  {nodes.filter(n => n.type === 'ENTRY').map(n => (
                    <option key={n.id} value={n.id}>{n.id} - {n.label}</option>
                  ))}
                </select>
              </div>

              {/* Destination Node Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Destination Station</span>
                <select 
                  value={selectedTargetNodeId || 'RANDOM'}
                  onChange={(e) => setSelectedTargetNodeId(e.target.value === 'RANDOM' ? null : e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <option value="RANDOM">🎲 Random Shipping Dock</option>
                  {nodes.filter(n => n.type === 'TERMINAL').map(n => (
                    <option key={n.id} value={n.id}>{n.id} - {n.label}</option>
                  ))}
                </select>
              </div>

              <button
                disabled={!isConnected}
                onClick={() => {
                  manualSpawn(
                    selectedSpawnType,
                    selectedSourceNodeId || undefined,
                    selectedTargetNodeId || undefined
                  );
                  // Switch to explainer to show Dijkstra trace of spawn
                  if (selectedSourceNodeId && selectedTargetNodeId) {
                    setActiveTab('explainer');
                  }
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm py-2 px-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
              >
                {isConnected ? 'Spawn Payload (Dijkstra Route)' : 'Server Offline (Cannot Spawn)'}
              </button>
            </div>

            {/* Jam Controller */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-600">
                Simulation Jams Control
              </label>
              <button
                onClick={clearAllJams}
                disabled={stats.jamsCount === 0}
                className="w-full border border-slate-200 hover:border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-bold text-sm py-2 px-4 rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                Reset & Clear All Jammed Lines
              </button>
            </div>

            {/* Auto Spawner Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-600">Auto Spawner</span>
                <span className="text-[10px] text-slate-400">Spawn random cargo periodically</span>
              </div>
              <button
                disabled={!isConnected}
                onClick={() => toggleAutoSpawn(!autoSpawnEnabled)}
                className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition-all cursor-pointer border ${
                  !isConnected
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : autoSpawnEnabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200/60'
                }`}
              >
                {!isConnected ? 'OFFLINE' : autoSpawnEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
              </button>
            </div>

            {/* Clock Tick Speed Adjustment */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-600">
                  Simulation Clock (Interval)
                </label>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {tickRateMs}ms
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="250"
                step="10"
                value={tickRateMs}
                onChange={(e) => changeTickRate(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-700"
              />
              <div className="flex justify-between text-[9px] text-slate-400 font-medium">
                <span>Fast (20ms)</span>
                <span>Normal (50ms)</span>
                <span>Slow (250ms)</span>
              </div>
            </div>
          </div>

          {/* Selected Package Details Inspector */}
          {selectedPkg && (
            <div className="blueprint-card rounded-2xl p-5 flex flex-col gap-3 border border-indigo-200 bg-indigo-50/15">
              <div className="flex justify-between items-center border-b border-indigo-100 pb-2">
                <h4 className="font-extrabold text-indigo-900 text-sm tracking-wide uppercase flex items-center gap-1.5">
                  <span>📦</span> Inspector: {selectedPkg.id}
                </h4>
                <button 
                  onClick={() => setSelectedPackageId(null)}
                  className="text-xs text-indigo-500 hover:text-indigo-700 font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
              
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Type:</span>
                  <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase border ${
                    selectedPkg.type === 'EXPRESS' 
                      ? 'bg-orange-50 text-orange-700 border-orange-200' 
                      : selectedPkg.type === 'FRAGILE'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {selectedPkg.type}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Status:</span>
                  <span className={`font-bold uppercase ${
                    selectedPkg.status === 'MOVING' 
                      ? 'text-emerald-600' 
                      : selectedPkg.status === 'WAITING' 
                      ? 'text-red-500 font-extrabold animate-pulse' 
                      : 'text-slate-500'
                  }`}>
                    {selectedPkg.status === 'WAITING' ? '🚨 Jam Blocked' : selectedPkg.status}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Speed:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedPkg.speed} px/tick</span>
                </div>
                
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between text-slate-500 font-medium">
                    <span>Segment Progress:</span>
                    <span className="font-mono">{(selectedPkg.progress * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-150 ${
                        selectedPkg.status === 'WAITING' ? 'bg-red-400' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${selectedPkg.progress * 100}%` }}
                    ></div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                  <span className="text-slate-500 font-medium">Active Dijkstra Route:</span>
                  <div className="flex flex-wrap gap-1 items-center mt-1">
                    {selectedPkg.route.map((nodeId, idx) => {
                      const isCurrent = idx === selectedPkg.currentRouteIndex;
                      const isNext = idx === selectedPkg.currentRouteIndex + 1;
                      const isVisited = idx < selectedPkg.currentRouteIndex;
                      
                      let nodeBg = 'bg-slate-50 text-slate-400 border-slate-200';
                      if (isCurrent) nodeBg = 'bg-indigo-600 text-white border-indigo-600 font-bold scale-105 shadow-sm';
                      if (isNext) nodeBg = 'bg-indigo-100 text-indigo-700 border-indigo-200 font-bold';
                      if (isVisited) nodeBg = 'bg-slate-100 text-slate-400 border-slate-200 line-through';

                      return (
                        <React.Fragment key={idx}>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${nodeBg}`}>
                            {nodeId}
                          </span>
                          {idx < selectedPkg.route.length - 1 && (
                            <span className="text-slate-400 text-[9px]">➔</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Map Nodes status inspector */}
          <div className="blueprint-card rounded-2xl p-5 flex flex-col gap-3">
            <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase border-b border-slate-200 pb-2.5">
              Nodes Inspector
            </h3>
            
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1">
                <span>STATION</span>
                <span>TYPE</span>
                <span>STATE</span>
              </div>

              {/* Dynamic list of active node presence */}
              {packages.length === 0 ? (
                <div className="text-slate-400 text-center py-4 text-xs italic">
                  No packages currently in transit.
                </div>
              ) : (
                packages.slice(0, 10).map((pkg) => {
                  const currentSegmentSource = pkg.route[pkg.currentRouteIndex];
                  const currentSegmentTarget = pkg.route[pkg.currentRouteIndex + 1] || 'Terminal';
                  const isSelected = pkg.id === selectedPackageId;
                  
                  return (
                    <div 
                      key={pkg.id} 
                      onClick={() => setSelectedPackageId(isSelected ? null : pkg.id)}
                      className={`flex justify-between items-center text-xs border rounded-lg p-1.5 font-mono cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-indigo-50 border-indigo-200 shadow-sm font-bold' 
                          : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[10px]">📦</span>
                        <span className={`font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>{pkg.id}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{pkg.type}</span>
                      <span className="text-[10px] font-bold text-slate-600 truncate max-w-[100px]">
                        {currentSegmentSource} ➔ {currentSegmentTarget}
                      </span>
                    </div>
                  );
                })
              )}
              {packages.length > 10 && (
                <div className="text-[10px] text-center text-slate-400 italic">
                  + {packages.length - 10} more package routes
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default App;
