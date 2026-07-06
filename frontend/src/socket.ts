import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from './types';

// Establish a connection with the backend server (configurable via environment variables)
const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:3001';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket']
});
