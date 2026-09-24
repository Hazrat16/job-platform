import type { WebSocketService } from "./websocketService.js";

/**
 * A single WebSocketService instance is created in bootstrap.ts once MongoDB is
 * connected. Both the REST chat controller and the socket event handlers need a
 * reference to it (to push a message directly to a connected recipient), so it's
 * registered here rather than threaded through every function call.
 */
let instance: WebSocketService | null = null;

export function setWebSocketService(service: WebSocketService): void {
  instance = service;
}

export function getWebSocketService(): WebSocketService | null {
  return instance;
}

export function clearWebSocketService(): void {
  instance = null;
}
