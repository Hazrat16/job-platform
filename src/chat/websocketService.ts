import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { ChatProducer } from "./producer.js";
import ChatMessage from "../models/chatModel.js";
import Conversation from "../models/conversationModel.js";

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

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * Setup Socket.IO middleware for authentication
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        
        if (!token) {
          return next(new Error("Authentication token required"));
        }

        // Remove 'Bearer ' prefix if present
        const cleanToken = token.replace("Bearer ", "");
        
        const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET || "fallback_secret") as any;
        
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        
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

      // Validate input
      if (!receiverId || !message) {
        socket.emit("error", { message: "Missing required fields" });
        return;
      }

      // Send message to RabbitMQ
      await ChatProducer.sendMessage({
        senderId: socket.userId,
        receiverId,
        message,
        messageType,
        timestamp: new Date(),
        attachments,
        replyTo,
      });

      // Emit message sent confirmation
      socket.emit("message_sent", {
        messageId: `temp_${Date.now()}`,
        receiverId,
        message,
        timestamp: new Date(),
        status: "sent",
      });

      console.log(`📤 Message sent from ${socket.userId} to ${receiverId}`);
      
    } catch (error) {
      console.error("❌ Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
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

      // Send read event to RabbitMQ
      await ChatProducer.publishEvent({
        type: "message_read",
        userId: socket.userId,
        targetUserId: senderId,
        conversationId,
        timestamp: new Date(),
      });

      // Emit to conversation room
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
        this.userRooms.get(socket.userId!)?.add(conversation._id.toString());
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
}
