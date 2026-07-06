import { WarehouseNode, WarehouseEdge } from '../types';

export interface DijkstraStep {
  currentNodeId: string | null;
  minDistance: number;
  visited: string[];
  unvisited: string[];
  distances: Record<string, number>;
  previous: Record<string, string | null>;
  relaxationLogs: string[];
}

export interface DijkstraTraceResult {
  path: string[] | null;
  steps: DijkstraStep[];
}

/**
 * Calculates the shortest path between startNodeId and endNodeId and records
 * a step-by-step execution trace of Dijkstra's algorithm for visualization.
 */
export function traceDijkstra(
  nodes: WarehouseNode[],
  edges: WarehouseEdge[],
  startNodeId: string,
  endNodeId: string
): DijkstraTraceResult {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const unvisited = new Set<string>();
  const visited: string[] = [];
  const steps: DijkstraStep[] = [];

  // Initialize
  for (const node of nodes) {
    distances[node.id] = node.id === startNodeId ? 0 : Infinity;
    previous[node.id] = null;
    unvisited.add(node.id);
  }

  // Helper to record a step
  const recordStep = (currentNodeId: string | null, minDistance: number, relaxationLogs: string[]) => {
    steps.push({
      currentNodeId,
      minDistance,
      visited: [...visited],
      unvisited: Array.from(unvisited),
      distances: { ...distances },
      previous: { ...previous },
      relaxationLogs
    });
  };

  while (unvisited.size > 0) {
    // Find unvisited node with the smallest distance
    let currentNodeId: string | null = null;
    let minDistance = Infinity;

    for (const nodeId of unvisited) {
      const dist = distances[nodeId] ?? Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        currentNodeId = nodeId;
      }
    }

    // If shortest distance is Infinity, remaining nodes are unreachable
    if (currentNodeId === null || minDistance === Infinity) {
      recordStep(null, Infinity, ['Remaining nodes are unreachable. Pathfinding terminates.']);
      break;
    }

    const relaxationLogs: string[] = [];
    relaxationLogs.push(`Selected unvisited node "${currentNodeId}" with distance ${minDistance === Infinity ? '∞' : minDistance}.`);

    unvisited.delete(currentNodeId);
    visited.push(currentNodeId);

    // Reached destination?
    if (currentNodeId === endNodeId) {
      relaxationLogs.push(`Destination "${endNodeId}" reached! Pathfinding successful.`);
      recordStep(currentNodeId, minDistance, relaxationLogs);
      
      // Reconstruct path
      const path: string[] = [];
      let current: string | null = endNodeId;
      while (current !== null) {
        path.unshift(current);
        current = previous[current] ?? null;
      }
      return { path, steps };
    }

    // Relax neighbors of current node
    const outgoingEdges = edges.filter(e => e.sourceNodeId === currentNodeId);
    if (outgoingEdges.length === 0) {
      relaxationLogs.push(`Node "${currentNodeId}" has no outgoing conveyor connections.`);
    }

    for (const edge of outgoingEdges) {
      const neighborId = edge.targetNodeId;
      if (!unvisited.has(neighborId)) {
        relaxationLogs.push(`Neighbor "${neighborId}" is already visited. Skipping.`);
        continue;
      }

      if (edge.isJammed) {
        relaxationLogs.push(`Conveyor to "${neighborId}" is JAMMED. Skipping (effective weight = ∞).`);
        continue;
      }

      const alternateDistance = minDistance + edge.weight;
      const currentNeighborDistance = distances[neighborId] ?? Infinity;

      if (alternateDistance < currentNeighborDistance) {
        distances[neighborId] = alternateDistance;
        previous[neighborId] = currentNodeId;
        relaxationLogs.push(
          `Relaxed neighbor "${neighborId}": distance via "${currentNodeId}" is ${alternateDistance} (shorter than current ${
            currentNeighborDistance === Infinity ? '∞' : currentNeighborDistance
          }). Previous node updated.`
        );
      } else {
        relaxationLogs.push(
          `Neighbor "${neighborId}": distance via "${currentNodeId}" is ${alternateDistance} (not shorter than current ${
            currentNeighborDistance === Infinity ? '∞' : currentNeighborDistance
          }).`
        );
      }
    }

    recordStep(currentNodeId, minDistance, relaxationLogs);
  }

  // If start and end are the same node
  if (startNodeId === endNodeId && nodes.some(n => n.id === startNodeId)) {
    return { path: [startNodeId], steps };
  }

  return { path: null, steps };
}
