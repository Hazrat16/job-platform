import { Request, Response } from "express";
import { ChatProducer } from "./producer.js";
import ChatMessage from "../models/chatModel.js";
import Conversation from "../models/conversationModel.js";
import User from "../models/userModel.js";

export class ChatController {
  /**
   * Send a chat message
   */
  static async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { receiverId, message, messageType = "text", attachments = [], replyTo } = req.body;
      const senderId = (req as any).user?.id;

      if (!senderId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      if (!receiverId || !message) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      // Check if receiver exists
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        res.status(404).json({ error: "Receiver not found" });
        return;
      }

      // Send message to RabbitMQ
      await ChatProducer.sendMessage({
        senderId,
        receiverId,
        message,
        messageType,
        timestamp: new Date(),
        attachments,
        replyTo,
      });

      res.json({ 
        message: "Message sent successfully",
        timestamp: new Date(),
        status: "sent"
      });

    } catch (error) {
      console.error("❌ Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  }

  /**
   * Get conversation between two users
   */
  static async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      // Find or create conversation
      let conversation = await Conversation.findOne({
        participants: { $all: [currentUserId, userId] },
        isGroupChat: false,
      });

      if (!conversation) {
        // Create new conversation
        conversation = new Conversation({
          participants: [currentUserId, userId],
          isGroupChat: false,
          unreadCount: new Map(),
        });
        await conversation.save();
      }

      // Get messages for this conversation
      const messages = await ChatMessage.find({
        $or: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId },
        ],
        isDeleted: false,
      })
      .sort({ timestamp: -1 })
      .limit(50)
      .populate("senderId", "name photo")
      .populate("receiverId", "name photo");

      // Mark messages as read
      await ChatMessage.updateMany(
        {
          senderId: userId,
          receiverId: currentUserId,
          isRead: false,
        },
        {
          isRead: true,
          readAt: new Date(),
        }
      );

      // Update conversation unread count
      conversation.markAsRead(currentUserId);
      await conversation.save();

      res.json({
        conversation: {
          id: conversation._id,
          participants: conversation.participants,
          lastMessage: conversation.lastMessage,
          lastMessageAt: conversation.lastMessageAt,
          unreadCount: conversation.unreadCount.get(currentUserId) || 0,
        },
        messages: messages.reverse(),
      });

    } catch (error) {
      console.error("❌ Error getting conversation:", error);
      res.status(500).json({ error: "Failed to get conversation" });
    }
  }

  /**
   * Get user's conversations list
   */
  static async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      const conversations = await Conversation.find({
        participants: currentUserId,
      })
      .populate("participants", "name photo email")
      .populate("lastMessage")
      .sort({ lastMessageAt: -1 });

      // Format conversations with unread counts
      const formattedConversations = conversations.map(conv => {
        const otherParticipant = conv.participants.find(
          (p: any) => p._id.toString() !== currentUserId
        );
        
        return {
          id: conv._id,
          otherParticipant: {
            id: otherParticipant?._id,
            name: otherParticipant?.name,
            photo: otherParticipant?.photo,
            email: otherParticipant?.email,
          },
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
          unreadCount: conv.unreadCount.get(currentUserId) || 0,
          isGroupChat: conv.isGroupChat,
          groupName: conv.groupName,
          groupAvatar: conv.groupAvatar,
        };
      });

      res.json({ conversations: formattedConversations });

    } catch (error) {
      console.error("❌ Error getting conversations:", error);
      res.status(500).json({ error: "Failed to get conversations" });
    }
  }

  /**
   * Get message history for a conversation
   */
  static async getMessageHistory(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      // Verify user is part of this conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(currentUserId as any)) {
        res.status(403).json({ error: "Access denied to this conversation" });
        return;
      }

      const skip = (Number(page) - 1) * Number(limit);

      const messages = await ChatMessage.find({
        $or: [
          { senderId: currentUserId, receiverId: { $in: conversation.participants } },
          { senderId: { $in: conversation.participants }, receiverId: currentUserId },
        ],
        isDeleted: false,
      })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("senderId", "name photo")
      .populate("receiverId", "name photo")
      .populate("replyTo", "message");

      const total = await ChatMessage.countDocuments({
        $or: [
          { senderId: currentUserId, receiverId: { $in: conversation.participants } },
          { senderId: { $in: conversation.participants }, receiverId: currentUserId },
        ],
        isDeleted: false,
      });

      res.json({
        messages: messages.reverse(),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });

    } catch (error) {
      console.error("❌ Error getting message history:", error);
      res.status(500).json({ error: "Failed to get message history" });
    }
  }

  /**
   * Search messages
   */
  static async searchMessages(req: Request, res: Response): Promise<void> {
    try {
      const { query, conversationId } = req.query;
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      if (!query) {
        res.status(400).json({ error: "Search query is required" });
        return;
      }

      let searchQuery: any = {
        $or: [
          { senderId: currentUserId },
          { receiverId: currentUserId },
        ],
        message: { $regex: query, $options: "i" },
        isDeleted: false,
      };

      // If searching in specific conversation
      if (conversationId) {
        const conversation = await Conversation.findById(conversationId);
        if (conversation && conversation.participants.includes(currentUserId as any)) {
          searchQuery.$or = [
            { senderId: currentUserId, receiverId: { $in: conversation.participants } },
            { senderId: { $in: conversation.participants }, receiverId: currentUserId },
          ];
        }
      }

      const messages = await ChatMessage.find(searchQuery)
        .sort({ timestamp: -1 })
        .limit(20)
        .populate("senderId", "name photo")
        .populate("receiverId", "name photo");

      res.json({ messages });

    } catch (error) {
      console.error("❌ Error searching messages:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  }

  /**
   * Mark messages as read
   */
  static async markMessagesAsRead(req: Request, res: Response): Promise<void> {
    try {
      const { senderId, conversationId } = req.body;
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      // Mark messages as read
      await ChatMessage.updateMany(
        {
          senderId,
          receiverId: currentUserId,
          isRead: false,
        },
        {
          isRead: true,
          readAt: new Date(),
        }
      );

      // Update conversation unread count
      if (conversationId) {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.markAsRead(currentUserId);
          await conversation.save();
        }
      }

      // Send read event to RabbitMQ
      await ChatProducer.publishEvent({
        type: "message_read",
        userId: currentUserId,
        targetUserId: senderId,
        conversationId,
        timestamp: new Date(),
      });

      res.json({ message: "Messages marked as read" });

    } catch (error) {
      console.error("❌ Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  }

  /**
   * Delete a message
   */
  static async deleteMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      const message = await ChatMessage.findById(messageId);
      if (!message) {
        res.status(404).json({ error: "Message not found" });
        return;
      }

      // Check if user owns the message
      if (message.senderId.toString() !== currentUserId) {
        res.status(403).json({ error: "Can only delete your own messages" });
        return;
      }

      // Soft delete
      message.isDeleted = true;
      message.deletedAt = new Date();
      await message.save();

      res.json({ message: "Message deleted successfully" });

    } catch (error) {
      console.error("❌ Error deleting message:", error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  }

  /**
   * Edit a message
   */
  static async editMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const { newMessage } = req.body;
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      if (!newMessage) {
        res.status(400).json({ error: "New message content is required" });
        return;
      }

      const message = await ChatMessage.findById(messageId);
      if (!message) {
        res.status(404).json({ error: "Message not found" });
        return;
      }

      // Check if user owns the message
      if (message.senderId.toString() !== currentUserId) {
        res.status(403).json({ error: "Can only edit your own messages" });
        return;
      }

      // Update message
      message.message = newMessage;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();

      res.json({ 
        message: "Message edited successfully",
        editedMessage: message,
      });

    } catch (error) {
      console.error("❌ Error editing message:", error);
      res.status(500).json({ error: "Failed to edit message" });
    }
  }

  /**
   * Get online users
   */
  static async getOnlineUsers(req: Request, res: Response): Promise<void> {
    try {
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      // This would typically integrate with your WebSocket service
      // For now, we'll return a placeholder
      res.json({ 
        message: "Online users feature requires WebSocket integration",
        onlineUsers: [],
      });

    } catch (error) {
      console.error("❌ Error getting online users:", error);
      res.status(500).json({ error: "Failed to get online users" });
    }
  }
}

// Legacy export for backward compatibility
export default ChatController.sendMessage;
