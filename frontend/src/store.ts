import { create } from 'zustand';
import { 
  WarehouseNode, 
  WarehouseEdge, 
  Package, 
  SimulationStats, 
  PackageType
} from './types';
import { mockNodes, mockEdges } from './mockData';
import { traceDijkstra } from './utils/dijkstraTracer';

// File-level state for the simulation loop
let simulationInterval: any = null;
let lastTickTime = Date.now();
let spawnTimer = 0;
const SPAWN_INTERVAL_MS = 1500;
const arrivalTimestamps: number[] = [];

// Helper to generate IDs
function generateId(): string {
  return 'PKG-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

// Map package types to speed and name
const PACKAGE_PROFILES: Record<PackageType, { speed: number; label: string }> = {
  STANDARD: { speed: 4, label: 'Standard Box' },
  EXPRESS: { speed: 9, label: 'Express Parcel' },
  FRAGILE: { speed: 1.5, label: 'Fragile Item' }
};

interface SimulationStore {
  // Connection state (always true in standalone mode)
  isConnected: boolean;
  
  // Graph and Simulation States
  nodes: WarehouseNode[];
  edges: WarehouseEdge[];
  packages: Package[];
  stats: SimulationStats;
  tickRateMs: number;
  
  // Selection and Previews
  selectedPackageId: string | null;
  selectedSourceNodeId: string | null;
  selectedTargetNodeId: string | null;
  
  // Real-time Event Logs
  logs: Array<{ id: string; timestamp: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>;
  isWaitingForSpawn: boolean;
  autoSpawnEnabled: boolean;

  // Actions
  addLog: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  setSelectedPackageId: (id: string | null) => void;
  setSelectedSourceNodeId: (id: string | null) => void;
  setSelectedTargetNodeId: (id: string | null) => void;
  
  // Simulation Actions
  toggleJam: (sourceNodeId: string, targetNodeId: string, isJammed: boolean) => void;
  manualSpawn: (type: PackageType, sourceNodeId?: string, targetNodeId?: string) => void;
  toggleAutoSpawn: (enabled: boolean) => void;
  clearAllJams: () => void;
  changeTickRate: (rate: number) => void;
  resetSimulation: () => void;
  
  // Loop Controls
  startSimulation: () => void;
  stopSimulation: () => void;
}

export const useStore = create<SimulationStore>((set, get) => {

  // Helper to spawn a single package
  const spawnPackage = (
    state: SimulationStore,
    type?: PackageType,
    sourceId?: string,
    targetId?: string
  ): Package | null => {
    const entries = state.nodes.filter(n => n.type === 'ENTRY');
    const terminals = state.nodes.filter(n => n.type === 'TERMINAL');

    if (entries.length === 0 || terminals.length === 0) return null;

    const sourceNode = sourceId 
      ? state.nodes.find(n => n.id === sourceId) 
      : entries[Math.floor(Math.random() * entries.length)];
    
    const targetNode = targetId 
      ? state.nodes.find(n => n.id === targetId) 
      : terminals[Math.floor(Math.random() * terminals.length)];

    if (!sourceNode || !targetNode) return null;

    const pkgType: PackageType = type || (['STANDARD', 'EXPRESS', 'FRAGILE'][Math.floor(Math.random() * 3)] as PackageType);
    const profile = PACKAGE_PROFILES[pkgType];

    // Calculate Dijkstra path using the utility
    const trace = traceDijkstra(state.nodes, state.edges, sourceNode.id, targetNode.id);
    const route = trace.path;
    if (!route || route.length < 2) {
      return null;
    }

    const pkg: Package = {
      id: generateId(),
      type: pkgType,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      route,
      currentRouteIndex: 0,
      progress: 0,
      speed: profile.speed,
      position: { x: sourceNode.x, y: sourceNode.y },
      status: 'MOVING',
      createdAt: Date.now()
    };

    // Add spawning log
    const routeStr = pkg.route.join(' ➔ ');
    const logMsg = `Package ${pkg.id} (${pkg.type}) spawned at ${pkg.sourceNodeId}. Optimal route: ${routeStr}`;
    
    // Trigger log addition synchronously
    setTimeout(() => {
      get().addLog(logMsg, 'info');
      // If we were waiting for manual spawn, select this package
      if (get().isWaitingForSpawn) {
        set({ selectedPackageId: pkg.id, isWaitingForSpawn: false });
      }
    }, 0);

    return pkg;
  };

  // Helper to recalculate paths for active packages when jams change
  const recalculateActiveRoutes = (state: SimulationStore) => {
    return state.packages.map(pkg => {
      if (pkg.status === 'ARRIVED') return pkg;

      const currentNodeId = pkg.route[pkg.currentRouteIndex];
      const nextNodeId = pkg.route[pkg.currentRouteIndex + 1];

      if (!nextNodeId) return pkg;

      const currentEdge = state.edges.find(e => e.sourceNodeId === currentNodeId && e.targetNodeId === nextNodeId);
      
      // If the package is in transit, it is locked on that conveyor segment
      if (pkg.progress > 0) {
        return {
          ...pkg,
          status: currentEdge?.isJammed ? 'WAITING' as const : 'MOVING' as const
        };
      }

      // Re-run pathfinder from current junction to target terminal
      const trace = traceDijkstra(state.nodes, state.edges, currentNodeId, pkg.targetNodeId);
      const newRoute = trace.path;
      
      if (newRoute && newRoute.length >= 2) {
        const mergedRoute = [
          ...pkg.route.slice(0, pkg.currentRouteIndex),
          ...newRoute
        ];
        
        const newNextNodeId = newRoute[1];
        const newEdge = state.edges.find(e => e.sourceNodeId === currentNodeId && e.targetNodeId === newNextNodeId);
        
        return {
          ...pkg,
          route: mergedRoute,
          status: newEdge?.isJammed ? 'WAITING' as const : 'MOVING' as const
        };
      } else {
        // No alternative route exists
        return {
          ...pkg,
          status: 'WAITING' as const
        };
      }
    });
  };

  // Main simulation tick logic
  const simulationTick = () => {
    set((state) => {
      const now = Date.now();
      const deltaTime = now - lastTickTime;
      lastTickTime = now;

      let nextPackages = [...state.packages];

      // 1. Periodic Auto Spawning Logic
      if (state.autoSpawnEnabled) {
        spawnTimer += deltaTime;
        if (spawnTimer >= SPAWN_INTERVAL_MS) {
          spawnTimer = 0;
          if (nextPackages.length < 20) {
            const spawned = spawnPackage(state, undefined, undefined, undefined);
            if (spawned) {
              nextPackages.push(spawned);
            }
          }
        }
      }

      // 2. Package Motion State Machine
      const activePackages: Package[] = [];
      const statsCopy = { ...state.stats };

      for (const pkg of nextPackages) {
        const currentNodeId = pkg.route[pkg.currentRouteIndex];
        const nextNodeId = pkg.route[pkg.currentRouteIndex + 1];

        if (!nextNodeId) {
          // Arrived at shipping dock
          const transitTime = now - pkg.createdAt;
          statsCopy.totalProcessed++;
          statsCopy.totalTransitTime += transitTime;
          
          arrivalTimestamps.push(now);
          
          // Log success arrival
          const seconds = (transitTime / 1000).toFixed(2);
          setTimeout(() => {
            get().addLog(`Package ${pkg.id} successfully sorted to terminal in ${seconds}s`, 'success');
          }, 0);
          continue;
        }

        const currentNode = state.nodes.find(n => n.id === currentNodeId)!;
        const nextNode = state.nodes.find(n => n.id === nextNodeId)!;
        const edge = state.edges.find(e => e.sourceNodeId === currentNodeId && e.targetNodeId === nextNodeId);

        // If edge is jammed, freeze the package in transit
        if (edge?.isJammed) {
          activePackages.push({
            ...pkg,
            status: 'WAITING' as const
          });
          continue;
        }

        // Normal movement along the segment
        const edgeWeight = edge ? edge.weight : 100;
        const progressIncrement = pkg.speed / edgeWeight;
        const newProgress = pkg.progress + progressIncrement;

        if (newProgress >= 1.0) {
          // Arrived at next node
          const updatedIndex = pkg.currentRouteIndex + 1;
          const updatedCurrentNodeId = pkg.route[updatedIndex];
          const updatedNextNodeId = pkg.route[updatedIndex + 1];
          
          if (!updatedNextNodeId) {
            // Arrived at final shipping terminal!
            const transitTime = now - pkg.createdAt;
            statsCopy.totalProcessed++;
            statsCopy.totalTransitTime += transitTime;
            
            arrivalTimestamps.push(now);
            
            const seconds = (transitTime / 1000).toFixed(2);
            setTimeout(() => {
              get().addLog(`Package ${pkg.id} successfully sorted to terminal in ${seconds}s`, 'success');
            }, 0);
          } else {
            // Recalculate dynamic route at the junction
            const trace = traceDijkstra(state.nodes, state.edges, updatedCurrentNodeId, pkg.targetNodeId);
            let updatedRoute = [...pkg.route];
            let nextStatus: 'MOVING' | 'WAITING' = 'MOVING';
            
            if (trace.path && trace.path.length >= 2) {
              updatedRoute = [
                ...pkg.route.slice(0, updatedIndex),
                ...trace.path
              ];
              
              const newNextNodeId = trace.path[1];
              const newEdge = state.edges.find(e => e.sourceNodeId === updatedCurrentNodeId && e.targetNodeId === newNextNodeId);
              if (newEdge?.isJammed) {
                nextStatus = 'WAITING' as const;
              }
            } else {
              // Path blocked
              nextStatus = 'WAITING' as const;
            }

            activePackages.push({
              ...pkg,
              route: updatedRoute,
              currentRouteIndex: updatedIndex,
              progress: 0,
              position: { x: nextNode.x, y: nextNode.y },
              status: nextStatus
            });
          }
        } else {
          // Interpolate current position coordinate
          const px = currentNode.x + (nextNode.x - currentNode.x) * newProgress;
          const py = currentNode.y + (nextNode.y - currentNode.y) * newProgress;

          activePackages.push({
            ...pkg,
            progress: newProgress,
            position: { x: px, y: py },
            status: 'MOVING' as const
          });
        }
      }

      // 3. Stats Aggregation
      while (arrivalTimestamps.length > 0 && arrivalTimestamps[0] < now - 60000) {
        arrivalTimestamps.shift();
      }
      statsCopy.throughput = arrivalTimestamps.length;
      statsCopy.activePackages = activePackages.length;
      statsCopy.jamsCount = state.edges.filter(e => e.isJammed).length;

      return {
        packages: activePackages,
        stats: statsCopy
      };
    });
  };

  // Start the simulation loop
  const startSimulation = () => {
    if (simulationInterval) clearInterval(simulationInterval);
    lastTickTime = Date.now();
    simulationInterval = setInterval(simulationTick, get().tickRateMs);
  };

  // Stop the simulation loop
  const stopSimulation = () => {
    if (simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }
  };

  // Initialize store and start simulation
  setTimeout(() => {
    get().addLog('Client-side Warehouse Simulation loop initialized', 'success');
    startSimulation();
  }, 50);

  return {
    isConnected: true, // Always connected to our local client-side engine!
    nodes: mockNodes,
    edges: mockEdges.map(edge => ({
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      weight: edge.weight,
      isJammed: false
    })),
    packages: [],
    stats: {
      totalProcessed: 0,
      totalTransitTime: 0,
      activePackages: 0,
      jamsCount: 0,
      throughput: 0
    },
    tickRateMs: 50,
    logs: [],
    
    selectedPackageId: null,
    selectedSourceNodeId: null,
    selectedTargetNodeId: null,
    isWaitingForSpawn: false,
    autoSpawnEnabled: true,

    addLog: (message, type = 'info') => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
      const newLog = {
        id: Math.random().toString(36).substring(2, 9).toUpperCase(),
        timestamp: timeStr,
        message,
        type
      };
      set((state) => ({
        logs: [newLog, ...state.logs].slice(0, 100) // Keep last 100 logs
      }));
    },

    setSelectedPackageId: (id) => set({ selectedPackageId: id }),
    setSelectedSourceNodeId: (id) => set({ selectedSourceNodeId: id }),
    setSelectedTargetNodeId: (id) => set({ selectedTargetNodeId: id }),

    toggleJam: (sourceNodeId, targetNodeId, isJammed) => {
      set((state) => {
        const updatedEdges = state.edges.map(edge => {
          if (edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId) {
            return { ...edge, isJammed };
          }
          return edge;
        });

        const statusText = isJammed ? 'JAMMED' : 'CLEARED';
        const logType = isJammed ? 'warning' : 'success';
        
        // Add log
        setTimeout(() => {
          get().addLog(
            `Conveyor ${sourceNodeId} ➔ ${targetNodeId} status toggled: ${statusText}. Recalculating routes...`,
            logType
          );
        }, 0);

        // Run reroutes reactively
        const nextState = { ...state, edges: updatedEdges };
        const updatedPackages = recalculateActiveRoutes(nextState);

        return {
          edges: updatedEdges,
          packages: updatedPackages,
          stats: {
            ...state.stats,
            jamsCount: updatedEdges.filter(e => e.isJammed).length
          }
        };
      });
    },

    manualSpawn: (type, sourceNodeId, targetNodeId) => {
      set((state) => {
        // Toggle flag to auto-select next spawned package
        const nodesCopy = [...state.nodes];
        const edgesCopy = state.edges.map(e => ({ ...e }));
        const packagesCopy = state.packages.map(p => ({
          ...p,
          position: { ...p.position },
          route: [...p.route]
        }));
        
        const stateContext = {
          ...state,
          nodes: nodesCopy,
          edges: edgesCopy,
          packages: packagesCopy,
          isWaitingForSpawn: true
        };

        const spawned = spawnPackage(stateContext, type, sourceNodeId, targetNodeId);
        
        if (spawned) {
          packagesCopy.push(spawned);
          return {
            isWaitingForSpawn: true,
            packages: packagesCopy,
            stats: {
              ...state.stats,
              activePackages: packagesCopy.length
            }
          };
        }
        
        return {};
      });
    },

    toggleAutoSpawn: (enabled) => {
      set({ autoSpawnEnabled: enabled });
      get().addLog(`Auto Spawner set to: ${enabled ? 'ENABLED' : 'DISABLED'}`, 'info');
    },

    clearAllJams: () => {
      set((state) => {
        const clearedEdges = state.edges.map(e => ({ ...e, isJammed: false }));
        
        setTimeout(() => {
          get().addLog('Command: Clear all conveyor jams', 'success');
        }, 0);

        const nextState = { ...state, edges: clearedEdges };
        const updatedPackages = recalculateActiveRoutes(nextState);

        return {
          edges: clearedEdges,
          packages: updatedPackages,
          stats: {
            ...state.stats,
            jamsCount: 0
          }
        };
      });
    },

    changeTickRate: (rate) => {
      if (rate >= 10 && rate <= 500) {
        set({ tickRateMs: rate });
        startSimulation();
        setTimeout(() => {
          get().addLog(`Simulation clock interval updated to ${rate}ms`, 'info');
        }, 0);
      }
    },

    resetSimulation: () => {
      stopSimulation();
      arrivalTimestamps.length = 0;
      set((state) => {
        const clearedEdges = state.edges.map(e => ({ ...e, isJammed: false }));
        setTimeout(() => {
          get().addLog('Simulation state and logs reset', 'info');
          startSimulation();
        }, 0);
        return {
          packages: [],
          edges: clearedEdges,
          logs: [],
          selectedPackageId: null,
          selectedSourceNodeId: null,
          selectedTargetNodeId: null,
          isWaitingForSpawn: false,
          autoSpawnEnabled: true,
          stats: {
            totalProcessed: 0,
            totalTransitTime: 0,
            activePackages: 0,
            jamsCount: 0,
            throughput: 0
          }
        };
      });
    },
    
    startSimulation,
    stopSimulation
  };
});
