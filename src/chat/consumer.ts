import mongoose from "mongoose";
import rabbitMQService from "./rabbitMQ.js";
import ChatMessage from "../models/chatModel.js";
import Conversation from "../models/conversationModel.js";
import { ChatMessagePayload, ChatEventPayload, NotificationPayload } from "./producer.js";
import { ChatProducer } from "./producer.js";

export class ChatConsumer {
  /**
   * Start consuming messages from all queues
   */
  static async startConsuming(): Promise<void> {
    try {
      console.log("🚀 Starting chat consumers...");
      
      // Start consuming chat messages
      await this.consumeChatMessages();
      
      // Start consuming notifications
      await this.consumeNotifications();
      
      // Start consuming chat events
      await this.consumeChatEvents();
      
      console.log("✅ All chat consumers started successfully");
    } catch (error) {
      console.error("❌ Failed to start chat consumers:", error);
      throw error;
    }
  }

  /**
   * Consume chat messages from the queue
   */
  private static async consumeChatMessages(): Promise<void> {
    await rabbitMQService.consumeQueue("chat-messages", async (message) => {
      if (!message) return;

      try {
        const content = JSON.parse(message.content.toString()) as ChatMessagePayload & { id: string; status: string };
        console.log("📩 Processing chat message:", content.id);

        // Save message to database
        const savedMessage = await this.saveMessageToDatabase(content);
        
        // Update conversation
        await this.updateConversation(content, savedMessage._id);
        
        // Send delivery confirmation
        await ChatProducer.publishEvent({
          type: "message_delivered",
          userId: content.receiverId,
          targetUserId: content.senderId,
          conversationId: content.conversationId || "",
          timestamp: new Date(),
        });

        // Send notification
        await ChatProducer.sendNotification({
          type: "new_message",
          userId: content.receiverId,
          title: "New Message",
          body: `You have a new message from ${content.senderId}`,
          data: { messageId: savedMessage._id, senderId: content.senderId },
          timestamp: new Date(),
        });

        console.log(`✅ Chat message ${content.id} processed successfully`);
        
        // Acknowledge message
        const channel = await rabbitMQService.getChannel();
        channel.ack(message);
        
      } catch (error) {
        console.error("❌ Error processing chat message:", error);
        
        // Negative acknowledge and requeue if it's a temporary error
        const channel = await rabbitMQService.getChannel();
        channel.nack(message, false, true);
      }
    });
  }

  /**
   * Consume notifications from the queue
   */
  private static async consumeNotifications(): Promise<void> {
    await rabbitMQService.consumeQueue("chat-notifications", async (message) => {
      if (!message) return;

      try {
        const content = JSON.parse(message.content.toString()) as NotificationPayload & { id: string; status: string };
        console.log("📢 Processing notification:", content.id);

        // Here you would integrate with your notification service
        // For now, we'll just log it
        console.log(`📢 Notification for ${content.userId}: ${content.title} - ${content.body}`);
        
        // In a real implementation, you might:
        // - Send push notification
        // - Send email
        // - Send SMS
        // - Update in-app notification center
        
        console.log(`✅ Notification ${content.id} processed successfully`);
        
        // Acknowledge message
        const channel = await rabbitMQService.getChannel();
        channel.ack(message);
        
      } catch (error) {
        console.error("❌ Error processing notification:", error);
        
        const channel = await rabbitMQService.getChannel();
        channel.nack(message, false, true);
      }
    });
  }

  /**
   * Consume chat events from the queue
   */
  private static async consumeChatEvents(): Promise<void> {
    await rabbitMQService.consumeQueue("chat-events", async (message) => {
      if (!message) return;

      try {
        const content = JSON.parse(message.content.toString()) as ChatEventPayload & { id: string };
        console.log("📡 Processing chat event:", content.type);

        // Handle different event types
        switch (content.type) {
          case "message_read":
            await this.handleMessageRead(content);
            break;
          case "typing_start":
          case "typing_stop":
            await this.handleTypingIndicator(content);
            break;
          case "user_online":
          case "user_offline":
            await this.handleUserStatus(content);
            break;
          default:
            console.log(`📡 Unhandled event type: ${content.type}`);
        }

        console.log(`✅ Chat event ${content.id} processed successfully`);
        
        // Acknowledge message
        const channel = await rabbitMQService.getChannel();
        channel.ack(message);
        
      } catch (error) {
        console.error("❌ Error processing chat event:", error);
        
        const channel = await rabbitMQService.getChannel();
        channel.nack(message, false, true);
      }
    });
  }

  /**
   * Save message to database
   */
  private static async saveMessageToDatabase(messageData: ChatMessagePayload): Promise<any> {
    try {
      const message = new ChatMessage({
        senderId: messageData.senderId,
        receiverId: messageData.receiverId,
        message: messageData.message,
        messageType: messageData.messageType,
        timestamp: messageData.timestamp,
        attachments: messageData.attachments || [],
        replyTo: messageData.replyTo,
      });

      const savedMessage = await message.save();
      console.log(`💾 Message saved to database: ${savedMessage._id}`);
      
      return savedMessage;
    } catch (error) {
      console.error("❌ Failed to save message to database:", error);
      throw error;
    }
  }

  /**
   * Update conversation with new message
   */
  private static async updateConversation(messageData: ChatMessagePayload, messageId: mongoose.Types.ObjectId): Promise<void> {
    try {
      const conversationId = this.generateConversationId(messageData.senderId, messageData.receiverId);
      
      let conversation = await Conversation.findOne({
        participants: { $all: [messageData.senderId, messageData.receiverId] },
        isGroupChat: false,
      });

      if (!conversation) {
        // Create new conversation
        conversation = new Conversation({
          participants: [messageData.senderId, messageData.receiverId],
          isGroupChat: false,
          unreadCount: new Map(),
        });
      }

      // Update conversation
      conversation.lastMessage = messageId;
      conversation.lastMessageAt = messageData.timestamp;
      conversation.incrementUnreadCount(new mongoose.Types.ObjectId(messageData.receiverId));
      
      await conversation.save();
      console.log(`💾 Conversation updated: ${conversation._id}`);
      
    } catch (error) {
      console.error("❌ Failed to update conversation:", error);
      throw error;
    }
  }

  /**
   * Handle message read event
   */
  private static async handleMessageRead(event: ChatEventPayload): Promise<void> {
    try {
      // Mark messages as read in database
      await ChatMessage.updateMany(
        {
          senderId: event.targetUserId,
          receiverId: event.userId,
          isRead: false,
        },
        {
          isRead: true,
          readAt: event.timestamp,
        }
      );

      // Update conversation unread count
      const conversation = await Conversation.findOne({
        participants: { $all: [event.userId, event.targetUserId] },
        isGroupChat: false,
      });

      if (conversation) {
        conversation.markAsRead(new mongoose.Types.ObjectId(event.userId));
        await conversation.save();
      }

      console.log(`✅ Messages marked as read for user ${event.userId}`);
    } catch (error) {
      console.error("❌ Failed to handle message read:", error);
      throw error;
    }
  }

  /**
   * Handle typing indicator
   */
  private static async handleTypingIndicator(event: ChatEventPayload): Promise<void> {
    try {
      // In a real implementation, you might:
      // - Store typing state in Redis for real-time access
      // - Broadcast to other users in the conversation
      // - Handle typing timeout
      
      console.log(`⌨️ User ${event.userId} ${event.type === 'typing_start' ? 'started' : 'stopped'} typing`);
    } catch (error) {
      console.error("❌ Failed to handle typing indicator:", error);
      throw error;
    }
  }

  /**
   * Handle user status change
   */
  private static async handleUserStatus(event: ChatEventPayload): Promise<void> {
    try {
      // In a real implementation, you might:
      // - Update user status in database
      // - Store online status in Redis
      // - Notify other users about status change
      
      console.log(`👤 User ${event.userId} is now ${event.type === 'user_online' ? 'online' : 'offline'}`);
    } catch (error) {
      console.error("❌ Failed to handle user status:", error);
      throw error;
    }
  }

  /**
   * Generate conversation ID for two users
   */
  private static generateConversationId(userId1: string, userId2: string): string {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}-${sortedIds[1]}`;
  }
}

// Legacy export for backward compatibility
export const consumeMessages = () => ChatConsumer.startConsuming();
