"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WarehouseMap = void 0;
class WarehouseMap {
    nodes = new Map();
    adjacencyList = new Map();
    constructor() { }
    /**
     * Registers a node in the warehouse map.
     */
    addNode(node) {
        this.nodes.set(node.id, node);
        if (!this.adjacencyList.has(node.id)) {
            this.adjacencyList.set(node.id, []);
        }
    }
    /**
     * Establishes a directed edge between two warehouse nodes.
     */
    addEdge(sourceNodeId, targetNodeId, weight) {
        if (!this.nodes.has(sourceNodeId) || !this.nodes.has(targetNodeId)) {
            throw new Error(`Cannot add edge: source (${sourceNodeId}) or target (${targetNodeId}) node does not exist.`);
        }
        const edge = {
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
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }
    /**
     * Returns a list of all nodes.
     */
    getAllNodes() {
        return Array.from(this.nodes.values());
    }
    /**
     * Returns a list of all edges.
     */
    getAllEdges() {
        const allEdges = [];
        for (const edges of this.adjacencyList.values()) {
            allEdges.push(...edges);
        }
        return allEdges;
    }
    /**
     * Retrieves adjacent outgoing edges for a given node.
     */
    getNeighbors(nodeId) {
        return this.adjacencyList.get(nodeId) || [];
    }
    /**
     * Finds the edge between two specific nodes, if it exists.
     */
    getEdge(sourceNodeId, targetNodeId) {
        const neighbors = this.getNeighbors(sourceNodeId);
        return neighbors.find(e => e.targetNodeId === targetNodeId);
    }
    /**
     * Toggles the jam status of a specific conveyor edge.
     */
    toggleJam(sourceNodeId, targetNodeId, isJammed) {
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
    clearAllJams() {
        for (const edges of this.adjacencyList.values()) {
            for (const edge of edges) {
                edge.isJammed = false;
            }
        }
    }
    /**
     * Computes the weight of an edge, returning Infinity if it is jammed.
     */
    getEffectiveWeight(sourceNodeId, targetNodeId) {
        const edge = this.getEdge(sourceNodeId, targetNodeId);
        if (!edge)
            return Infinity;
        return edge.isJammed ? Infinity : edge.weight;
    }
}
exports.WarehouseMap = WarehouseMap;
