import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from './types';

// Establish a connection with the backend server running on port 3001
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io('http://localhost:3001', {
  autoConnect: true,
  transports: ['websocket']
});
