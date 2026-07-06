export type NodeType = 'ENTRY' | 'JUNCTION' | 'MERGE' | 'TERMINAL';

export interface WarehouseNode {
  id: string;
  x: number;
  y: number;
  type: NodeType;
  label: string;
}

export interface WarehouseEdge {
  sourceNodeId: string;
  targetNodeId: string;
  weight: number;
  isJammed: boolean;
}

export type PackageType = 'STANDARD' | 'EXPRESS' | 'FRAGILE';

export interface Package {
  id: string;
  type: PackageType;
  sourceNodeId: string;
  targetNodeId: string;
  route: string[];
  currentRouteIndex: number; // Index of current node in route. Next is currentRouteIndex + 1.
  progress: number; // 0.0 to 1.0 representing distance traveled between current and next node.
  speed: number; // Progress increment per simulation tick.
  position: { x: number; y: number };
  status: 'MOVING' | 'WAITING' | 'ARRIVED';
  createdAt: number;
  completedAt?: number;
}

export interface SimulationStats {
  totalProcessed: number;
  totalTransitTime: number; // cumulative milliseconds for completed transits
  activePackages: number;
  jamsCount: number;
  throughput: number; // completed packages per minute
}

export interface SimulationState {
  nodes: WarehouseNode[];
  edges: WarehouseEdge[];
  packages: Package[];
  stats: SimulationStats;
  tickRateMs: number;
  autoSpawnEnabled: boolean;
}

// Socket communication interfaces
export interface ServerToClientEvents {
  stateUpdate: (state: SimulationState) => void;
  packageSpawned: (pkg: Package) => void;
  packageArrived: (pkgId: string, transitTimeMs: number) => void;
}

export interface ClientToServerEvents {
  toggleJam: (data: { sourceNodeId: string; targetNodeId: string; isJammed: boolean }) => void;
  manualSpawn: (data: { type: PackageType; sourceNodeId?: string; targetNodeId?: string }) => void;
  toggleAutoSpawn: (enabled: boolean) => void;
  changeTickRate: (tickRateMs: number) => void;
  clearAllJams: () => void;
  resetSimulation: () => void;
}
