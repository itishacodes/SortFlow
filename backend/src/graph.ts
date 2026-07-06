import { WarehouseNode, WarehouseEdge } from './types';

export class WarehouseMap {
  private nodes: Map<string, WarehouseNode> = new Map();
  private adjacencyList: Map<string, WarehouseEdge[]> = new Map();

  constructor() {}

  /**
   * Registers a node in the warehouse map.
   */
  public addNode(node: WarehouseNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, []);
    }
  }

  /**
   * Establishes a directed edge between two warehouse nodes.
   */
  public addEdge(sourceNodeId: string, targetNodeId: string, weight: number): void {
    if (!this.nodes.has(sourceNodeId) || !this.nodes.has(targetNodeId)) {
      throw new Error(`Cannot add edge: source (${sourceNodeId}) or target (${targetNodeId}) node does not exist.`);
    }

    const edge: WarehouseEdge = {
      sourceNodeId,
      targetNodeId,
      weight,
      isJammed: false
    };

    const edges = this.adjacencyList.get(sourceNodeId) || [];
    edges.push(edge);
    this.adjacencyList.set(sourceNodeId, edges);
  }

  /**
   * Retrieves a node by its ID.
   */
  public getNode(nodeId: string): WarehouseNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Returns a list of all nodes.
   */
  public getAllNodes(): WarehouseNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Returns a list of all edges.
   */
  public getAllEdges(): WarehouseEdge[] {
    const allEdges: WarehouseEdge[] = [];
    for (const edges of this.adjacencyList.values()) {
      allEdges.push(...edges);
    }
    return allEdges;
  }

  /**
   * Retrieves adjacent outgoing edges for a given node.
   */
  public getNeighbors(nodeId: string): WarehouseEdge[] {
    return this.adjacencyList.get(nodeId) || [];
  }

  /**
   * Finds the edge between two specific nodes, if it exists.
   */
  public getEdge(sourceNodeId: string, targetNodeId: string): WarehouseEdge | undefined {
    const neighbors = this.getNeighbors(sourceNodeId);
    return neighbors.find(e => e.targetNodeId === targetNodeId);
  }

  /**
   * Toggles the jam status of a specific conveyor edge.
   */
  public toggleJam(sourceNodeId: string, targetNodeId: string, isJammed: boolean): boolean {
    const edge = this.getEdge(sourceNodeId, targetNodeId);
    if (edge) {
      edge.isJammed = isJammed;
      return true;
    }
    return false;
  }

  /**
   * Clears jams on all conveyor edges.
   */
  public clearAllJams(): void {
    for (const edges of this.adjacencyList.values()) {
      for (const edge of edges) {
        edge.isJammed = false;
      }
    }
  }

  /**
   * Computes the weight of an edge, returning Infinity if it is jammed.
   */
  public getEffectiveWeight(sourceNodeId: string, targetNodeId: string): number {
    const edge = this.getEdge(sourceNodeId, targetNodeId);
    if (!edge) return Infinity;
    return edge.isJammed ? Infinity : edge.weight;
  }
}
