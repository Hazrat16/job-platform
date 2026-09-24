import express from "express";
import {
  deleteMessage,
  editMessage,
  getConversation,
  getConversations,
  getMessageHistory,
  getOnlineUsers,
  markMessagesAsRead,
  searchMessages,
  sendMessage,
} from "../chat/chatController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/send", sendMessage);
router.get("/conversation/:userId", getConversation);
router.get("/conversations", getConversations);
router.get("/conversation/:conversationId/messages", getMessageHistory);
router.get("/search", searchMessages);
router.post("/mark-read", markMessagesAsRead);
router.delete("/message/:messageId", deleteMessage);
router.put("/message/:messageId", editMessage);
router.get("/online-users", getOnlineUsers);

export default router;
