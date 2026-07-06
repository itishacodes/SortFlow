import { WarehouseMap } from './graph';
import { WarehouseNode } from './types';

// Define the 11 warehouse nodes with their X/Y canvas grid coordinates
export const mockNodes: WarehouseNode[] = [
  // Entry Gates (Left side)
  { id: 'E1', x: 100, y: 180, type: 'ENTRY', label: 'Entry Gate 1' },
  { id: 'E2', x: 100, y: 420, type: 'ENTRY', label: 'Entry Gate 2' },

  // Interconnected Junctions (Middle-Left)
  { id: 'J1', x: 320, y: 150, type: 'JUNCTION', label: 'Sort Junction 1' },
  { id: 'J2', x: 320, y: 450, type: 'JUNCTION', label: 'Sort Junction 2' },
  { id: 'J3', x: 550, y: 200, type: 'JUNCTION', label: 'Sort Junction 3' },
  { id: 'J4', x: 550, y: 400, type: 'JUNCTION', label: 'Sort Junction 4' },

  // Collision-Avoidance Merges (Middle-Right)
  { id: 'M1', x: 750, y: 220, type: 'MERGE', label: 'Merge Hub 1' },
  { id: 'M2', x: 750, y: 380, type: 'MERGE', label: 'Merge Hub 2' },

  // Terminal Shipping Docks (Right side)
  { id: 'T1', x: 920, y: 150, type: 'TERMINAL', label: 'Shipping Dock A' },
  { id: 'T2', x: 920, y: 300, type: 'TERMINAL', label: 'Shipping Dock B' },
  { id: 'T3', x: 920, y: 450, type: 'TERMINAL', label: 'Shipping Dock C' }
];

export interface MockEdgeDef {
  source: string;
  target: string;
  weight: number;
}

// Directed conveyor connections with weights representing physical length/travel cost
export const mockEdges: MockEdgeDef[] = [
  // Entry Gates to Junctions
  { source: 'E1', target: 'J1', weight: 220 },
  { source: 'E1', target: 'J2', weight: 300 },
  { source: 'E2', target: 'J1', weight: 300 },
  { source: 'E2', target: 'J2', weight: 220 },

  // Interconnected Junctions
  { source: 'J1', target: 'J3', weight: 230 },
  { source: 'J1', target: 'J4', weight: 320 },
  { source: 'J2', target: 'J4', weight: 230 },
  { source: 'J2', target: 'J3', weight: 320 },
  
  // Cross-overs between junctions
  { source: 'J3', target: 'J4', weight: 200 },
  { source: 'J4', target: 'J3', weight: 200 },

  // Junctions to Merge Hubs
  { source: 'J3', target: 'M1', weight: 200 },
  { source: 'J3', target: 'M2', weight: 280 },
  { source: 'J4', target: 'M2', weight: 200 },
  { source: 'J4', target: 'M1', weight: 280 },

  // Merge Hubs to Terminals
  { source: 'M1', target: 'T1', weight: 180 },
  { source: 'M1', target: 'T2', weight: 170 },
  { source: 'M2', target: 'T2', weight: 170 },
  { source: 'M2', target: 'T3', weight: 180 }
];

/**
 * Seeds a WarehouseMap instance with the mock nodes and edges.
 */
export function seedWarehouseMap(): WarehouseMap {
  const map = new WarehouseMap();
  
  for (const node of mockNodes) {
    map.addNode(node);
  }

  for (const edge of mockEdges) {
    map.addEdge(edge.source, edge.target, edge.weight);
  }

  return map;
}
