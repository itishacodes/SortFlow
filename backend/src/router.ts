import { WarehouseMap } from './graph';

/**
 * Calculates the shortest path between startNodeId and endNodeId using Dijkstra's algorithm.
 * Dynamically accounts for edge jams (which toggle weight to Infinity).
 * 
 * @returns Ordered array of node IDs representing the optimal route, or null if no route is found.
 */
export function findShortestPath(
  map: WarehouseMap,
  startNodeId: string,
  endNodeId: string
): string[] | null {
  const nodes = map.getAllNodes();
  
  // Track shortest distance from start node to each node
  const distances: Map<string, number> = new Map();
  // Track previous node in optimal path
  const previous: Map<string, string | null> = new Map();
  // Set of unvisited nodes
  const unvisited: Set<string> = new Set();

  // Initialize nodes
  for (const node of nodes) {
    distances.set(node.id, node.id === startNodeId ? 0 : Infinity);
    previous.set(node.id, null);
    unvisited.add(node.id);
  }

  while (unvisited.size > 0) {
    // Find unvisited node with the smallest distance
    let currentNodeId: string | null = null;
    let minDistance = Infinity;

    for (const nodeId of unvisited) {
      const dist = distances.get(nodeId) ?? Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        currentNodeId = nodeId;
      }
    }

    // If shortest distance is Infinity, remaining nodes are unreachable
    if (currentNodeId === null || minDistance === Infinity) {
      break;
    }

    // Reached destination, reconstruct and return path
    if (currentNodeId === endNodeId) {
      const path: string[] = [];
      let current: string | null = endNodeId;
      while (current !== null) {
        path.unshift(current);
        current = previous.get(current) ?? null;
      }
      return path;
    }

    unvisited.delete(currentNodeId);

    // Update distances for neighbors
    const neighbors = map.getNeighbors(currentNodeId);
    for (const edge of neighbors) {
      const neighborId = edge.targetNodeId;
      if (!unvisited.has(neighborId)) continue;

      const weight = map.getEffectiveWeight(currentNodeId, neighborId);
      // Skip if weight is Infinity (e.g., conveyor is jammed)
      if (weight === Infinity) continue;

      const alternateDistance = minDistance + weight;
      const currentNeighborDistance = distances.get(neighborId) ?? Infinity;

      if (alternateDistance < currentNeighborDistance) {
        distances.set(neighborId, alternateDistance);
        previous.set(neighborId, currentNodeId);
      }
    }
  }

  // If start and end are the same node
  if (startNodeId === endNodeId && map.getNode(startNodeId)) {
    return [startNodeId];
  }

  return null; // Destination unreachable
}
