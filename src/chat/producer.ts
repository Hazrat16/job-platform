import rabbitMQService from "./rabbitMQ.js";
import { IChatMessage } from "../models/chatModel.js";

export interface ChatMessagePayload {
  senderId: string;
  receiverId: string;
  message: string;
  messageType: "text" | "image" | "file" | "audio" | "video";
  timestamp: Date;
  attachments?: string[];
  replyTo?: string;
  conversationId?: string;
}

export interface ChatEventPayload {
  type: "message_sent" | "message_delivered" | "message_read" | "typing_start" | "typing_stop" | "user_online" | "user_offline";
  userId: string;
  targetUserId?: string;
  conversationId?: string;
  data?: any;
  timestamp: Date;
}

export interface NotificationPayload {
  type: "new_message" | "message_read" | "user_online" | "user_offline";
  userId: string;
  title: string;
  body: string;
  data?: any;
  timestamp: Date;
}

export class ChatProducer {
  /**
   * Send a chat message to the queue
   */
  static async sendMessage(message: ChatMessagePayload): Promise<void> {
    try {
      await rabbitMQService.sendToQueue("chat-messages", {
        ...message,
        id: this.generateMessageId(),
        status: "pending",
      });
      
      console.log(`📤 Chat message queued for ${message.receiverId}`);
    } catch (error) {
      console.error("❌ Failed to queue chat message:", error);
      throw error;
    }
  }

  /**
   * Publish a chat event to the exchange
   */
  static async publishEvent(event: ChatEventPayload): Promise<void> {
    try {
      await rabbitMQService.publishToExchange("chat.fanout", "", {
        ...event,
        id: this.generateMessageId(),
      });
      
      console.log(`📤 Chat event published: ${event.type}`);
    } catch (error) {
      console.error("❌ Failed to publish chat event:", error);
      throw error;
    }
  }

  /**
   * Send notification to the queue
   */
  static async sendNotification(notification: NotificationPayload): Promise<void> {
    try {
      await rabbitMQService.sendToQueue("chat-notifications", {
        ...notification,
        id: this.generateMessageId(),
        status: "pending",
      });
      
      console.log(`📤 Notification queued for ${notification.userId}`);
    } catch (error) {
      console.error("❌ Failed to queue notification:", error);
      throw error;
    }
  }

  /**
   * Send direct message to specific user
   */
  static async sendDirectMessage(message: ChatMessagePayload): Promise<void> {
    try {
      await rabbitMQService.publishToExchange("chat.direct", "message", {
        ...message,
        id: this.generateMessageId(),
        status: "sent",
        deliveryMethod: "direct",
      });
      
      console.log(`📤 Direct message sent to ${message.receiverId}`);
    } catch (error) {
      console.error("❌ Failed to send direct message:", error);
      throw error;
    }
  }

  /**
   * Broadcast message to multiple users
   */
  static async broadcastMessage(message: Omit<ChatMessagePayload, "receiverId">, userIds: string[]): Promise<void> {
    try {
      const broadcastPayload = {
        ...message,
        id: this.generateMessageId(),
        broadcast: true,
        targetUserIds: userIds,
        timestamp: new Date(),
      };

      await rabbitMQService.publishToExchange("chat.fanout", "", broadcastPayload);
      
      console.log(`📤 Broadcast message sent to ${userIds.length} users`);
    } catch (error) {
      console.error("❌ Failed to broadcast message:", error);
      throw error;
    }
  }

  /**
   * Send typing indicator
   */
  static async sendTypingIndicator(userId: string, targetUserId: string, isTyping: boolean): Promise<void> {
    try {
      const event: ChatEventPayload = {
        type: isTyping ? "typing_start" : "typing_stop",
        userId,
        targetUserId,
        timestamp: new Date(),
      };

      await this.publishEvent(event);
    } catch (error) {
      console.error("❌ Failed to send typing indicator:", error);
      throw error;
    }
  }

  /**
   * Send online/offline status
   */
  static async sendUserStatus(userId: string, isOnline: boolean): Promise<void> {
    try {
      const event: ChatEventPayload = {
        type: isOnline ? "user_online" : "user_offline",
        userId,
        timestamp: new Date(),
      };

      await this.publishEvent(event);
    } catch (error) {
      console.error("❌ Failed to send user status:", error);
      throw error;
    }
  }

  /**
   * Generate unique message ID
   */
  private static generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Legacy export for backward compatibility
export const sendMessageToQueue = (message: ChatMessagePayload) => ChatProducer.sendMessage(message);
