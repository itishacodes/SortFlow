import { create } from 'zustand';
import { socket } from './socket';
import { 
  SimulationState, 
  WarehouseNode, 
  WarehouseEdge, 
  Package, 
  SimulationStats, 
  PackageType 
} from './types';

interface SimulationStore {
  // Connection state
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
  
  // UX State
  isWaitingForSpawn: boolean;
  autoSpawnEnabled: boolean;

  // Actions
  setConnected: (connected: boolean) => void;
  updateState: (state: SimulationState) => void;
  addLog: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  
  setSelectedPackageId: (id: string | null) => void;
  setSelectedSourceNodeId: (id: string | null) => void;
  setSelectedTargetNodeId: (id: string | null) => void;
  
  // Commands sent to Backend
  toggleJam: (sourceNodeId: string, targetNodeId: string, isJammed: boolean) => void;
  manualSpawn: (type: PackageType, sourceNodeId?: string, targetNodeId?: string) => void;
  toggleAutoSpawn: (enabled: boolean) => void;
  clearAllJams: () => void;
  changeTickRate: (rate: number) => void;
  resetSimulation: () => void;
}

export const useStore = create<SimulationStore>((set, get) => {
  // Bind Socket connection listeners
  socket.on('connect', () => {
    set({ isConnected: true });
    get().addLog('Connected to simulation server', 'success');
  });

  socket.on('disconnect', () => {
    set({ isConnected: false });
    get().addLog('Disconnected from simulation server', 'error');
  });

  socket.on('stateUpdate', (state: SimulationState) => {
    const currentSelectedId = get().selectedPackageId;
    const isStillActive = currentSelectedId 
      ? state.packages.some(p => p.id === currentSelectedId) 
      : false;
      
    set({
      nodes: state.nodes,
      edges: state.edges,
      packages: state.packages,
      stats: state.stats,
      tickRateMs: state.tickRateMs,
      selectedPackageId: isStillActive ? currentSelectedId : null,
      autoSpawnEnabled: state.autoSpawnEnabled
    });
  });

  socket.on('packageSpawned', (pkg: Package) => {
    const routeStr = pkg.route.join(' ➔ ');
    get().addLog(
      `Package ${pkg.id} (${pkg.type}) spawned at ${pkg.sourceNodeId}. Optimal route: ${routeStr}`,
      'info'
    );
    if (get().isWaitingForSpawn) {
      set({ selectedPackageId: pkg.id, isWaitingForSpawn: false });
    }
  });

  socket.on('packageArrived', (pkgId: string, transitTimeMs: number) => {
    const seconds = (transitTimeMs / 1000).toFixed(2);
    get().addLog(
      `Package ${pkgId} successfully sorted to terminal in ${seconds}s`,
      'success'
    );
  });

  return {
    isConnected: false,
    nodes: [],
    edges: [],
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
    isWaitingForSpawn: false,
    autoSpawnEnabled: true,
    
    selectedPackageId: null,
    selectedSourceNodeId: null,
    selectedTargetNodeId: null,

    setConnected: (connected) => set({ isConnected: connected }),

    updateState: (state) => {
      const currentSelectedId = get().selectedPackageId;
      const isStillActive = currentSelectedId 
        ? state.packages.some(p => p.id === currentSelectedId) 
        : false;
      set({
        nodes: state.nodes,
        edges: state.edges,
        packages: state.packages,
        stats: state.stats,
        tickRateMs: state.tickRateMs,
        selectedPackageId: isStillActive ? currentSelectedId : null,
        autoSpawnEnabled: state.autoSpawnEnabled
      });
    },

    setSelectedPackageId: (id) => set({ selectedPackageId: id }),
    setSelectedSourceNodeId: (id) => set({ selectedSourceNodeId: id }),
    setSelectedTargetNodeId: (id) => set({ selectedTargetNodeId: id }),

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

    toggleJam: (sourceNodeId, targetNodeId, isJammed) => {
      socket.emit('toggleJam', { sourceNodeId, targetNodeId, isJammed });
      const statusText = isJammed ? 'JAMMED' : 'CLEARED';
      const logType = isJammed ? 'warning' : 'success';
      get().addLog(
        `Conveyor ${sourceNodeId} ➔ ${targetNodeId} status toggled: ${statusText}. Recalculating routes...`,
        logType
      );
    },

    manualSpawn: (type, sourceNodeId, targetNodeId) => {
      set({ isWaitingForSpawn: true });
      socket.emit('manualSpawn', { type, sourceNodeId, targetNodeId });
    },

    toggleAutoSpawn: (enabled) => {
      socket.emit('toggleAutoSpawn', enabled);
    },

    clearAllJams: () => {
      socket.emit('clearAllJams');
      get().addLog('Sent command: Clear all conveyor jams', 'success');
    },

    changeTickRate: (rate) => {
      socket.emit('changeTickRate', rate);
      get().addLog(`Sent command: Update simulation interval to ${rate}ms`, 'info');
    },

    resetSimulation: () => {
      socket.emit('resetSimulation');
      set({ 
        logs: [],
        selectedPackageId: null,
        selectedSourceNodeId: null,
        selectedTargetNodeId: null,
        isWaitingForSpawn: false,
        autoSpawnEnabled: true
      });
      get().addLog('Simulation state and logs reset', 'info');
    }
  };
});
