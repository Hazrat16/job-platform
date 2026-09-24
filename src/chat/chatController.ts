import { Request, Response } from "express";
import * as chatService from "../services/chatService.js";
import { fail, ok } from "../utils/http.js";

type AuthedRequest = Request & { user?: { id?: string } };

export const sendMessage = async (req: Request, res: Response) => {
  const senderId = (req as AuthedRequest).user?.id;
  if (!senderId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  const { receiverId, message, messageType, attachments, replyTo } = req.body;
  const result = await chatService.sendMessage({
    senderId,
    receiverId,
    message,
    messageType,
    attachments,
    replyTo,
  });
  return ok(res, result, "Message sent successfully");
};

export const getConversation = async (req: Request, res: Response) => {
  const currentUserId = (req as AuthedRequest).user?.id;
  if (!currentUserId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  const { userId } = req.params;
  const result = await chatService.getConversation(currentUserId, userId as string);
  return ok(res, result, "Conversation loaded");
};

export const getConversations = async (req: Request, res: Response) => {
  const currentUserId = (req as AuthedRequest).user?.id;
  if (!currentUserId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  const conversations = await chatService.getConversations(currentUserId);
  return ok(res, { conversations }, "Conversations loaded");
};

export const getMessageHistory = async (req: Request, res: Response) => {
  const currentUserId = (req as AuthedRequest).user?.id;
  if (!currentUserId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  const { conversationId } = req.params;
  const page = Number(req.query["page"] ?? 1) || 1;
  const limit = Number(req.query["limit"] ?? 50) || 50;
  const result = await chatService.getMessageHistory(currentUserId, conversationId, page, limit);
  return ok(res, result, "Message history loaded");
};

export const searchMessages = async (req: Request, res: Response) => {
  const currentUserId = (req as AuthedRequest).user?.id;
  if (!currentUserId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  const { query, conversationId } = req.query;
  const messages = await chatService.searchMessages(
    currentUserId,
    String(query || ""),
    conversationId as string | undefined,
  );
  return ok(res, { messages }, "Search complete");
};

export const markMessagesAsRead = async (req: Request, res: Response) => {
  const currentUserId = (req as AuthedRequest).user?.id;
  if (!currentUserId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  const { senderId, conversationId } = req.body;
  await chatService.markMessagesAsRead(currentUserId, senderId, conversationId);
  return ok(res, null, "Messages marked as read");
};

export const deleteMessage = async (req: Request, res: Response) => {
  const currentUserId = (req as AuthedRequest).user?.id;
  if (!currentUserId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  await chatService.deleteMessage(currentUserId, req.params["messageId"]);
  return ok(res, null, "Message deleted successfully");
};

export const editMessage = async (req: Request, res: Response) => {
  const currentUserId = (req as AuthedRequest).user?.id;
  if (!currentUserId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  const { messageId } = req.params;
  const { newMessage } = req.body;
  const editedMessage = await chatService.editMessage(currentUserId, messageId, newMessage);
  return ok(res, { editedMessage }, "Message edited successfully");
};

export const getOnlineUsers = async (req: Request, res: Response) => {
  const currentUserId = (req as AuthedRequest).user?.id;
  if (!currentUserId) {
    return fail(res, 401, "UNAUTHORIZED", "User not authenticated");
  }

  const onlineUsers = chatService.getOnlineUsers();
  return ok(res, { onlineUsers }, "Online users loaded");
};
