import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";
import jwt from "jsonwebtoken";
import { ChatProducer } from "./producer.js";
import Conversation from "../models/conversationModel.js";
import { getAllowedOrigins } from "../config/corsOrigins.js";
import { logInfo, logWarnThrottled } from "../utils/logger.js";
import * as chatService from "../services/chatService.js";
import { HttpError } from "../utils/http.js";

const REDIS_ADAPTER_ERROR_LOG_INTERVAL_MS = 60_000;

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

interface ChatRoom {
  id: string;
  participants: string[];
  type: "direct" | "group";
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, AuthenticatedSocket> = new Map();
  private userRooms: Map<string, Set<string>> = new Map();
  private redisAdapterClients: IORedis[] = [];

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: getAllowedOrigins(),
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    this.setupRedisAdapter();
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * Without this, Socket.IO keeps connected-socket and room state in the process's own
   * memory, so broadcasts/rooms never reach sockets connected to a different instance —
   * horizontal scaling silently breaks. Falls back to the default in-memory adapter
   * (single-instance only, current behavior) when REDIS_URL isn't configured.
   */
  private setupRedisAdapter(): void {
    const REDIS_URL = process.env["REDIS_URL"];
    if (!REDIS_URL) return;

    // maxRetriesPerRequest: null is required here, not just a nicety — the adapter
    // issues its own subscribe command internally on subClient, outside our control.
    // With the default limit (20), that queued command eventually gives up and
    // rejects while the connection is still down, and since we never see that
    // promise directly, it surfaces as an unhandled rejection instead of a
    // catchable error. `null` makes it wait on the connection's own retry policy
    // rather than a fixed per-command attempt count.
    const pubClient = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    this.redisAdapterClients = [pubClient, subClient];

    pubClient.on("error", (err) =>
      logWarnThrottled(
        "socketio_redis_adapter_error:pub",
        REDIS_ADAPTER_ERROR_LOG_INTERVAL_MS,
        "socketio_redis_adapter_error",
        { client: "pub", error: String(err) },
      ),
    );
    subClient.on("error", (err) =>
      logWarnThrottled(
        "socketio_redis_adapter_error:sub",
        REDIS_ADAPTER_ERROR_LOG_INTERVAL_MS,
        "socketio_redis_adapter_error",
        { client: "sub", error: String(err) },
      ),
    );

    this.io.adapter(createAdapter(pubClient, subClient));
    logInfo("socketio_redis_adapter_enabled");
  }

  /**
   * Setup Socket.IO middleware for authentication
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const tokenFromAuth = socket.handshake.auth["token"];
        const tokenFromHeader = socket.handshake.headers["authorization"];
        const token = tokenFromAuth || tokenFromHeader;
        
        if (!token) {
          return next(new Error("Authentication token required"));
        }

        // Remove 'Bearer ' prefix if present
        const cleanToken = String(token).replace("Bearer ", "");
        
        const decoded = jwt.verify(
          cleanToken,
          process.env["JWT_SECRET"] || "fallback_secret",
        ) as { id?: string; role?: string };
        
        if (decoded.id) socket.userId = decoded.id;
        if (decoded.role) socket.userRole = decoded.role;
        
        next();
      } catch (error) {
        console.error("❌ WebSocket authentication failed:", error);
        next(new Error("Invalid authentication token"));
      }
    });
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(`🔌 User ${socket.userId} connected to WebSocket`);
      
      this.handleConnection(socket);
      this.setupSocketEvents(socket);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: AuthenticatedSocket): void {
    if (!socket.userId) return;

    // Add user to connected users map
    this.connectedUsers.set(socket.userId, socket);
    
    // Join user's personal room
    socket.join(`user:${socket.userId}`);
    
    // Send online status to other users
    this.broadcastUserStatus(socket.userId, true);
    
    // Load user's conversations and join rooms
    this.loadUserConversations(socket);
  }

  /**
   * Setup individual socket event handlers
   */
  private setupSocketEvents(socket: AuthenticatedSocket): void {
    if (!socket.userId) return;

    // Handle chat message
    socket.on("send_message", async (data) => {
      await this.handleSendMessage(socket, data);
    });

    // Handle typing indicator
    socket.on("typing_start", (data) => {
      this.handleTypingStart(socket, data);
    });

    socket.on("typing_stop", (data) => {
      this.handleTypingStop(socket, data);
    });

    // Handle message read
    socket.on("mark_read", async (data) => {
      await this.handleMarkRead(socket, data);
    });

    // Handle join conversation
    socket.on("join_conversation", (data) => {
      this.handleJoinConversation(socket, data);
    });

    // Handle leave conversation
    socket.on("leave_conversation", (data) => {
      this.handleLeaveConversation(socket, data);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      this.handleDisconnect(socket);
    });
  }

  /**
   * Handle sending a chat message
   */
  private async handleSendMessage(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      if (!socket.userId) return;

      const { receiverId, message, messageType = "text", attachments = [], replyTo } = data;

      // Delegates to the same service function the REST /chat/send endpoint uses,
      // so the two entry points can't drift into different behavior (persistence
      // via RabbitMQ, best-effort direct delivery to the receiver's live socket).
      const result = await chatService.sendMessage({
        senderId: socket.userId,
        receiverId,
        message,
        messageType,
        attachments,
        replyTo,
      });

      socket.emit("message_sent", {
        messageId: result.clientMessageId,
        receiverId,
        message,
        timestamp: result.timestamp,
        status: result.status,
      });

      console.log(`📤 Message sent from ${socket.userId} to ${receiverId}`);
    } catch (error) {
      const errorMessage = error instanceof HttpError ? error.message : "Failed to send message";
      socket.emit("error", { message: errorMessage });
    }
  }

  /**
   * Handle typing start indicator
   */
  private handleTypingStart(socket: AuthenticatedSocket, data: any): void {
    try {
      if (!socket.userId) return;

      const { targetUserId, conversationId } = data;

      // Send typing indicator to RabbitMQ
      ChatProducer.sendTypingIndicator(socket.userId, targetUserId, true);

      // Emit to conversation room
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("user_typing", {
          userId: socket.userId,
          isTyping: true,
        });
      }
      
    } catch (error) {
      console.error("❌ Error handling typing start:", error);
    }
  }

  /**
   * Handle typing stop indicator
   */
  private handleTypingStop(socket: AuthenticatedSocket, data: any): void {
    try {
      if (!socket.userId) return;

      const { targetUserId, conversationId } = data;

      // Send typing indicator to RabbitMQ
      ChatProducer.sendTypingIndicator(socket.userId, targetUserId, false);

      // Emit to conversation room
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("user_typing", {
          userId: socket.userId,
          isTyping: false,
        });
      }
      
    } catch (error) {
      console.error("❌ Error handling typing stop:", error);
    }
  }

  /**
   * Handle marking messages as read
   */
  private async handleMarkRead(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      if (!socket.userId) return;

      const { senderId, conversationId } = data;

      // Delegates to the same service function the REST /chat/mark-read endpoint
      // uses — this previously only published an event/room broadcast here without
      // ever updating ChatMessage.isRead or the conversation's unread count, so a
      // client relying solely on the socket path never actually had its unread
      // state persisted.
      await chatService.markMessagesAsRead(socket.userId, senderId, conversationId);

      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("messages_read", {
          userId: socket.userId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("❌ Error marking messages as read:", error);
    }
  }

  /**
   * Handle joining a conversation
   */
  private handleJoinConversation(socket: AuthenticatedSocket, data: any): void {
    try {
      if (!socket.userId) return;

      const { conversationId } = data;

      if (conversationId) {
        socket.join(`conversation:${conversationId}`);
        
        // Track user's rooms
        if (!this.userRooms.has(socket.userId)) {
          this.userRooms.set(socket.userId, new Set());
        }
        this.userRooms.get(socket.userId)?.add(conversationId);
        
        console.log(`👥 User ${socket.userId} joined conversation ${conversationId}`);
      }
      
    } catch (error) {
      console.error("❌ Error joining conversation:", error);
    }
  }

  /**
   * Handle leaving a conversation
   */
  private handleLeaveConversation(socket: AuthenticatedSocket, data: any): void {
    try {
      if (!socket.userId) return;

      const { conversationId } = data;

      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
        
        // Remove from user's rooms
        this.userRooms.get(socket.userId)?.delete(conversationId);
        
        console.log(`👋 User ${socket.userId} left conversation ${conversationId}`);
      }
      
    } catch (error) {
      console.error("❌ Error leaving conversation:", error);
    }
  }

  /**
   * Handle WebSocket disconnect
   */
  private handleDisconnect(socket: AuthenticatedSocket): void {
    try {
      if (!socket.userId) return;

      console.log(`🔌 User ${socket.userId} disconnected from WebSocket`);
      
      // Remove from connected users
      this.connectedUsers.delete(socket.userId);
      
      // Remove from user rooms
      this.userRooms.delete(socket.userId);
      
      // Send offline status to other users
      this.broadcastUserStatus(socket.userId, false);
      
    } catch (error) {
      console.error("❌ Error handling disconnect:", error);
    }
  }

  /**
   * Load user's conversations and join rooms
   */
  private async loadUserConversations(socket: AuthenticatedSocket): Promise<void> {
    try {
      if (!socket.userId) return;

      // Find user's conversations
      const conversations = await Conversation.find({
        participants: socket.userId,
      }).populate("participants", "name photo");

      // Join conversation rooms
      for (const conversation of conversations) {
        const roomId = `conversation:${conversation._id}`;
        socket.join(roomId);
        
        // Track user's rooms
        if (!this.userRooms.has(socket.userId!)) {
          this.userRooms.set(socket.userId!, new Set());
        }
        this.userRooms.get(socket.userId!)?.add(String(conversation._id));
      }

      // Send conversations to user
      socket.emit("conversations_loaded", { conversations });
      
    } catch (error) {
      console.error("❌ Error loading user conversations:", error);
    }
  }

  /**
   * Broadcast user status change
   */
  private broadcastUserStatus(userId: string, isOnline: boolean): void {
    try {
      // Send to RabbitMQ
      ChatProducer.sendUserStatus(userId, isOnline);

      // Broadcast to all connected users
      this.io.emit("user_status_change", {
        userId,
        isOnline,
        timestamp: new Date(),
      });
      
    } catch (error) {
      console.error("❌ Error broadcasting user status:", error);
    }
  }

  /**
   * Send message to specific user
   */
  public sendToUser(userId: string, event: string, data: any): void {
    const userSocket = this.connectedUsers.get(userId);
    if (userSocket) {
      userSocket.emit(event, data);
    }
  }

  /**
   * Send message to conversation room
   */
  public sendToConversation(conversationId: string, event: string, data: any): void {
    this.io.to(`conversation:${conversationId}`).emit(event, data);
  }

  /**
   * Broadcast to all connected users
   */
  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /**
   * Get connected users count
   */
  public getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Check if user is connected
   */
  public isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * IDs of every user with an active connection on this instance. In a
   * horizontally-scaled deployment (Redis adapter enabled) this only reflects
   * sockets connected to *this* process — there's no cross-instance presence
   * registry, only cross-instance message/event delivery.
   */
  public getConnectedUserIds(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  /** Disconnects all sockets and shuts down the Socket.IO server (for graceful shutdown). */
  public async close(): Promise<void> {
    this.io.disconnectSockets(true);
    await new Promise<void>((resolve) => this.io.close(() => resolve()));
    for (const client of this.redisAdapterClients) {
      await client.quit().catch(() => client.disconnect());
    }
  }
}
