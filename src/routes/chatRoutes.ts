import express from "express";
import { ChatController } from "../chat/chatController.js";
import { authenticateToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Apply authentication middleware to all chat routes
router.use(authenticateToken);

// Send a message
router.post("/send", ChatController.sendMessage);

// Get conversation with a specific user
router.get("/conversation/:userId", ChatController.getConversation);

// Get all user conversations
router.get("/conversations", ChatController.getConversations);

// Get message history for a conversation
router.get("/conversation/:conversationId/messages", ChatController.getMessageHistory);

// Search messages
router.get("/search", ChatController.searchMessages);

// Mark messages as read
router.post("/mark-read", ChatController.markMessagesAsRead);

// Delete a message
router.delete("/message/:messageId", ChatController.deleteMessage);

// Edit a message
router.put("/message/:messageId", ChatController.editMessage);

// Get online users
router.get("/online-users", ChatController.getOnlineUsers);

export default router;
