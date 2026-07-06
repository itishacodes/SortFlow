"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const mockData_1 = require("./mockData");
const router_1 = require("./router");
const PORT = 3001;
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: 'http://localhost:3000' }));
app.use(express_1.default.json());
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST']
    }
});
// Initialize Warehouse Graph Map
const warehouseMap = (0, mockData_1.seedWarehouseMap)();
// Simulation State
let packages = [];
let tickRateMs = 50; // 20 ticks per second
let lastTickTime = Date.now();
let spawnTimer = 0;
const SPAWN_INTERVAL_MS = 1500; // Spawn a new package every 1.5 seconds
let autoSpawnEnabled = true;
// Keep track of package arrivals in the last 60 seconds for throughput calculations
const arrivalTimestamps = [];
const stats = {
    totalProcessed: 0,
    totalTransitTime: 0,
    activePackages: 0,
    jamsCount: 0,
    throughput: 0
};
// Map package types to speed and name
const PACKAGE_PROFILES = {
    STANDARD: { speed: 4, label: 'Standard Box' },
    EXPRESS: { speed: 9, label: 'Express Parcel' },
    FRAGILE: { speed: 1.5, label: 'Fragile Item' }
};
/**
 * Generates a unique package ID.
 */
function generateId() {
    return 'PKG-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}
/**
 * Spawns a package at one of the entry gates and routes it.
 */
function spawnPackage(type, sourceId, targetId) {
    const entries = warehouseMap.getAllNodes().filter(n => n.type === 'ENTRY');
    const terminals = warehouseMap.getAllNodes().filter(n => n.type === 'TERMINAL');
    if (entries.length === 0 || terminals.length === 0)
        return null;
    const sourceNode = sourceId
        ? warehouseMap.getNode(sourceId)
        : entries[Math.floor(Math.random() * entries.length)];
    const targetNode = targetId
        ? warehouseMap.getNode(targetId)
        : terminals[Math.floor(Math.random() * terminals.length)];
    if (!sourceNode || !targetNode)
        return null;
    const pkgType = type || ['STANDARD', 'EXPRESS', 'FRAGILE'][Math.floor(Math.random() * 3)];
    const profile = PACKAGE_PROFILES[pkgType];
    // Route calculation
    const route = (0, router_1.findShortestPath)(warehouseMap, sourceNode.id, targetNode.id);
    if (!route || route.length < 2) {
        // No route available (could be due to starting node isolated by jams)
        return null;
    }
    const pkg = {
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
    packages.push(pkg);
    io.emit('packageSpawned', pkg);
    return pkg;
}
/**
 * Triggers a path recalculation for all active packages.
 * Called when a conveyor belt jams or unjams.
 */
function recalculateActiveRoutes() {
    for (const pkg of packages) {
        if (pkg.status === 'ARRIVED')
            continue;
        const currentNodeId = pkg.route[pkg.currentRouteIndex];
        const nextNodeId = pkg.route[pkg.currentRouteIndex + 1];
        if (!nextNodeId)
            continue;
        // Check if the current edge the package is traversing is jammed
        const currentEdge = warehouseMap.getEdge(currentNodeId, nextNodeId);
        // If the package is already on the edge (progress > 0), we don't reroute it;
        // it is physically locked on this conveyor segment.
        if (pkg.progress > 0) {
            if (currentEdge?.isJammed) {
                pkg.status = 'WAITING';
            }
            else {
                pkg.status = 'MOVING';
            }
            continue;
        }
        // If progress is 0, the package is at currentNodeId.
        // Recalculate route from currentNodeId to the original targetNodeId.
        const newRoute = (0, router_1.findShortestPath)(warehouseMap, currentNodeId, pkg.targetNodeId);
        if (newRoute && newRoute.length >= 2) {
            // Preserve history of traversed nodes by slicing
            pkg.route = [
                ...pkg.route.slice(0, pkg.currentRouteIndex),
                ...newRoute
            ];
            const newNextNodeId = newRoute[1];
            const newEdge = warehouseMap.getEdge(currentNodeId, newNextNodeId);
            if (newEdge?.isJammed) {
                pkg.status = 'WAITING';
            }
            else {
                pkg.status = 'MOVING';
            }
        }
        else {
            // No alternate route exists
            pkg.status = 'WAITING';
        }
    }
}
/**
 * Updates the throughput calculation (packages processed in the last 60 seconds).
 */
function updateThroughput() {
    const now = Date.now();
    // Remove timestamps older than 60 seconds
    while (arrivalTimestamps.length > 0 && arrivalTimestamps[0] < now - 60000) {
        arrivalTimestamps.shift();
    }
    stats.throughput = arrivalTimestamps.length;
}
/**
 * Central simulation tick. Updates package positions, pathing, and stats.
 */
function simulationTick() {
    const now = Date.now();
    const deltaTime = now - lastTickTime;
    lastTickTime = now;
    // 1. Spawning Logic
    spawnTimer += deltaTime;
    if (spawnTimer >= SPAWN_INTERVAL_MS) {
        spawnTimer = 0;
        // Cap maximum active packages on screen to prevent visual clutter
        if (autoSpawnEnabled && packages.length < 20) {
            spawnPackage();
        }
    }
    // 2. Package Motion and Pathing State Machine
    const nextPackages = [];
    for (const pkg of packages) {
        const currentNodeId = pkg.route[pkg.currentRouteIndex];
        const nextNodeId = pkg.route[pkg.currentRouteIndex + 1];
        if (!nextNodeId) {
            // Arrived at terminal dock
            pkg.status = 'ARRIVED';
            pkg.completedAt = now;
            const transitTime = now - pkg.createdAt;
            stats.totalProcessed++;
            stats.totalTransitTime += transitTime;
            arrivalTimestamps.push(now);
            io.emit('packageArrived', pkg.id, transitTime);
            continue;
        }
        const currentNode = warehouseMap.getNode(currentNodeId);
        const nextNode = warehouseMap.getNode(nextNodeId);
        const edge = warehouseMap.getEdge(currentNodeId, nextNodeId);
        // If edge is jammed, freeze the package
        if (edge?.isJammed) {
            pkg.status = 'WAITING';
            // Keep its position exactly where it was in transit to prevent teleportation back to the start node
            nextPackages.push(pkg);
            continue;
        }
        // Normal movement
        pkg.status = 'MOVING';
        // speed is progress increment per tick. Weight represents distance.
        const edgeWeight = edge ? edge.weight : 100;
        const progressIncrement = pkg.speed / edgeWeight;
        pkg.progress += progressIncrement;
        if (pkg.progress >= 1.0) {
            // Arrived at next node
            pkg.progress = 0;
            pkg.currentRouteIndex++;
            const updatedCurrentNodeId = pkg.route[pkg.currentRouteIndex];
            const updatedNextNodeId = pkg.route[pkg.currentRouteIndex + 1];
            if (!updatedNextNodeId) {
                // Arrived at final shipping dock!
                pkg.status = 'ARRIVED';
                pkg.position = { x: nextNode.x, y: nextNode.y };
                pkg.completedAt = now;
                const transitTime = now - pkg.createdAt;
                stats.totalProcessed++;
                stats.totalTransitTime += transitTime;
                arrivalTimestamps.push(now);
                io.emit('packageArrived', pkg.id, transitTime);
            }
            else {
                // Prepare for the next segment
                pkg.position = { x: nextNode.x, y: nextNode.y };
                // Dynamically optimize and recalculate Dijkstra path at every junction node
                const alternateRoute = (0, router_1.findShortestPath)(warehouseMap, updatedCurrentNodeId, pkg.targetNodeId);
                if (alternateRoute && alternateRoute.length >= 2) {
                    pkg.route = [
                        ...pkg.route.slice(0, pkg.currentRouteIndex),
                        ...alternateRoute
                    ];
                    const newNextNodeId = alternateRoute[1];
                    const newEdge = warehouseMap.getEdge(updatedCurrentNodeId, newNextNodeId);
                    if (newEdge?.isJammed) {
                        pkg.status = 'WAITING';
                    }
                    else {
                        pkg.status = 'MOVING';
                    }
                }
                else {
                    // No alternate path to the target terminal exists
                    pkg.status = 'WAITING';
                }
                nextPackages.push(pkg);
            }
        }
        else {
            // Interpolate position along the current edge segment
            pkg.position.x = currentNode.x + (nextNode.x - currentNode.x) * pkg.progress;
            pkg.position.y = currentNode.y + (nextNode.y - currentNode.y) * pkg.progress;
            nextPackages.push(pkg);
        }
    }
    packages = nextPackages;
    // 3. Stats Aggregation
    updateThroughput();
    stats.activePackages = packages.length;
    stats.jamsCount = warehouseMap.getAllEdges().filter(e => e.isJammed).length;
    // 4. Emit Current Frame State to Clients
    const state = {
        nodes: warehouseMap.getAllNodes(),
        edges: warehouseMap.getAllEdges(),
        packages,
        stats,
        tickRateMs,
        autoSpawnEnabled
    };
    io.emit('stateUpdate', state);
}
// Start simulation loop
let simulationInterval = setInterval(simulationTick, tickRateMs);
// Socket Connection Handler
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    // Send initial state immediately
    const initialState = {
        nodes: warehouseMap.getAllNodes(),
        edges: warehouseMap.getAllEdges(),
        packages,
        stats,
        tickRateMs,
        autoSpawnEnabled
    };
    socket.emit('stateUpdate', initialState);
    // Toggle Jam event
    socket.on('toggleJam', ({ sourceNodeId, targetNodeId, isJammed }) => {
        const success = warehouseMap.toggleJam(sourceNodeId, targetNodeId, isJammed);
        if (success) {
            console.log(`Jam status on edge ${sourceNodeId} -> ${targetNodeId} toggled to ${isJammed}`);
            recalculateActiveRoutes();
        }
    });
    // Manual Spawn event
    socket.on('manualSpawn', ({ type, sourceNodeId, targetNodeId }) => {
        const pkg = spawnPackage(type, sourceNodeId, targetNodeId);
        if (pkg) {
            console.log(`Manually spawned package: ${pkg.id} (${pkg.type}) from ${pkg.sourceNodeId} to ${pkg.targetNodeId}`);
        }
    });
    // Toggle auto spawning
    socket.on('toggleAutoSpawn', (enabled) => {
        autoSpawnEnabled = enabled;
        console.log(`Auto spawn status toggled to ${enabled}`);
        const state = {
            nodes: warehouseMap.getAllNodes(),
            edges: warehouseMap.getAllEdges(),
            packages,
            stats,
            tickRateMs,
            autoSpawnEnabled
        };
        io.emit('stateUpdate', state);
    });
    // Change simulation tick rate
    socket.on('changeTickRate', (newRate) => {
        if (newRate >= 10 && newRate <= 500) {
            tickRateMs = newRate;
            clearInterval(simulationInterval);
            simulationInterval = setInterval(simulationTick, tickRateMs);
            console.log(`Simulation tick rate updated to ${tickRateMs}ms`);
        }
    });
    // Clear all jams
    socket.on('clearAllJams', () => {
        warehouseMap.clearAllJams();
        recalculateActiveRoutes();
        console.log('All conveyor jams cleared');
    });
    // Reset simulation
    socket.on('resetSimulation', () => {
        packages = [];
        arrivalTimestamps.length = 0;
        warehouseMap.clearAllJams();
        autoSpawnEnabled = true;
        stats.totalProcessed = 0;
        stats.totalTransitTime = 0;
        stats.activePackages = 0;
        stats.jamsCount = 0;
        stats.throughput = 0;
        console.log('Simulation reset');
    });
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});
// App Healthcheck Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', activePackages: packages.length, jamsCount: stats.jamsCount });
});
httpServer.listen(PORT, () => {
    console.log(`SortFlow Backend Server running on http://localhost:${PORT}`);
});
