import mongoose from "mongoose";
import { getWebSocketService } from "../chat/websocketRegistry.js";
import { ChatProducer } from "../chat/producer.js";
import ChatMessage, { type IChatMessage } from "../models/chatModel.js";
import Conversation from "../models/conversationModel.js";
import User from "../models/userModel.js";
import { HttpError } from "../utils/http.js";
import { logWarn } from "../utils/logger.js";

/** Escapes regex metacharacters so a user's search text is matched literally —
 * passing it straight into `$regex` would let a crafted pattern (e.g. catastrophic
 * backtracking) run arbitrary regex matching against every message in the collection. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type SendChatMessageInput = {
  senderId: string;
  receiverId: string;
  message: string;
  messageType?: IChatMessage["messageType"];
  attachments?: string[];
  replyTo?: string;
};

/**
 * Shared by both the REST endpoint and the `send_message` socket event, so the two
 * entry points can't drift into different behavior.
 *
 * The message is persisted directly here rather than relying on the RabbitMQ
 * consumer (chat/consumer.ts) to save it — a request that answers "sent" must not
 * depend on a message broker being reachable (bootstrap.ts explicitly keeps the
 * REST API running even when the chat broker fails to connect, and this function
 * needs to honor that). RabbitMQ/WebSocket delivery below is best-effort fanout on
 * top of the already-durable write, never a reason to fail the request.
 */
export async function sendMessage(input: SendChatMessageInput) {
  if (!input.receiverId || !input.message) {
    throw new HttpError(400, "BAD_REQUEST", "Missing required fields");
  }

  const receiver = await User.findById(input.receiverId);
  if (!receiver) {
    throw new HttpError(404, "NOT_FOUND", "Receiver not found");
  }

  const timestamp = new Date();
  const messageType = input.messageType || "text";
  const attachments = input.attachments || [];
  const clientMessageId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const saved = await ChatMessage.create({
    senderId: input.senderId,
    receiverId: input.receiverId,
    message: input.message,
    messageType,
    timestamp,
    attachments,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });

  const conversation = await getOrCreateConversation(input.senderId, input.receiverId);
  conversation.lastMessage = saved._id as mongoose.Types.ObjectId;
  conversation.lastMessageAt = timestamp;
  conversation.incrementUnreadCount(new mongoose.Types.ObjectId(input.receiverId));
  await conversation.save();

  ChatProducer.publishEvent({
    type: "message_sent",
    userId: input.senderId,
    targetUserId: input.receiverId,
    conversationId: String(conversation._id),
    data: { messageId: String(saved._id) },
    timestamp,
  }).catch((err) => {
    logWarn("chat_publish_event_failed", { event: "message_sent", error: String(err) });
  });

  getWebSocketService()?.sendToUser(input.receiverId, "new_message", {
    clientMessageId,
    messageId: String(saved._id),
    senderId: input.senderId,
    receiverId: input.receiverId,
    message: input.message,
    messageType,
    attachments,
    replyTo: input.replyTo,
    timestamp,
  });

  return { clientMessageId, messageId: String(saved._id), timestamp, status: "sent" as const };
}

export async function getOrCreateConversation(userId: string, otherUserId: string) {
  let conversation = await Conversation.findOne({
    participants: { $all: [userId, otherUserId] },
    isGroupChat: false,
  });

  if (!conversation) {
    conversation = new Conversation({
      participants: [userId, otherUserId],
      isGroupChat: false,
      unreadCount: new Map(),
    });
    await conversation.save();
  }

  return conversation;
}

export async function getConversation(userId: string, otherUserId: string) {
  const conversation = await getOrCreateConversation(userId, otherUserId);

  const messages = await ChatMessage.find({
    $or: [
      { senderId: userId, receiverId: otherUserId },
      { senderId: otherUserId, receiverId: userId },
    ],
    isDeleted: false,
  })
    .sort({ timestamp: -1 })
    .limit(50)
    .populate("senderId", "name photo")
    .populate("receiverId", "name photo");

  await ChatMessage.updateMany(
    { senderId: otherUserId, receiverId: userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );

  conversation.markAsRead(userId as unknown as mongoose.Types.ObjectId);
  await conversation.save();

  return {
    conversation: {
      id: conversation._id,
      participants: conversation.participants,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: conversation.unreadCount.get(userId) || 0,
    },
    messages: messages.reverse(),
  };
}

export async function getConversations(userId: string) {
  const conversations = await Conversation.find({ participants: userId })
    .populate("participants", "name photo email")
    .populate("lastMessage")
    .sort({ lastMessageAt: -1 });

  return conversations.map((conv) => {
    const participants = conv.participants as Array<{
      _id: { toString(): string };
      name?: string;
      photo?: string;
      email?: string;
    }>;
    const otherParticipant = participants.find((p) => p._id.toString() !== userId);

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
      unreadCount: conv.unreadCount.get(userId) || 0,
      isGroupChat: conv.isGroupChat,
      groupName: conv.groupName,
      groupAvatar: conv.groupAvatar,
    };
  });
}

export async function getMessageHistory(
  userId: string,
  conversationId: string | undefined,
  page: number,
  limit: number,
) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !conversation.participants.some((p) => p.toString() === userId)) {
    throw new HttpError(403, "FORBIDDEN", "Access denied to this conversation");
  }

  const skip = (page - 1) * limit;
  const filter = {
    $or: [
      { senderId: userId, receiverId: { $in: conversation.participants } },
      { senderId: { $in: conversation.participants }, receiverId: userId },
    ],
    isDeleted: false,
  };

  const [messages, total] = await Promise.all([
    ChatMessage.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate("senderId", "name photo")
      .populate("receiverId", "name photo")
      .populate("replyTo", "message"),
    ChatMessage.countDocuments(filter),
  ]);

  return {
    messages: messages.reverse(),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function searchMessages(
  userId: string,
  query: string,
  conversationId: string | undefined,
) {
  if (!query) {
    throw new HttpError(400, "BAD_REQUEST", "Search query is required");
  }

  let orClause: Record<string, unknown>[] = [{ senderId: userId }, { receiverId: userId }];

  if (conversationId) {
    const conversation = await Conversation.findById(conversationId);
    if (conversation && conversation.participants.some((p) => p.toString() === userId)) {
      orClause = [
        { senderId: userId, receiverId: { $in: conversation.participants } },
        { senderId: { $in: conversation.participants }, receiverId: userId },
      ];
    }
  }

  return ChatMessage.find({
    $or: orClause,
    message: { $regex: escapeRegExp(query), $options: "i" },
    isDeleted: false,
  })
    .sort({ timestamp: -1 })
    .limit(20)
    .populate("senderId", "name photo")
    .populate("receiverId", "name photo");
}

export async function markMessagesAsRead(
  userId: string,
  senderId: string,
  conversationId: string | undefined,
): Promise<void> {
  await ChatMessage.updateMany(
    { senderId, receiverId: userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );

  if (conversationId) {
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.markAsRead(userId as unknown as mongoose.Types.ObjectId);
      await conversation.save();
    }
  }

  // Best-effort — the read state above is already durably saved; a broker outage
  // must never fail this request (see the comment on sendMessage).
  ChatProducer.publishEvent({
    type: "message_read",
    userId,
    targetUserId: senderId,
    ...(conversationId ? { conversationId } : {}),
    timestamp: new Date(),
  }).catch((err) => {
    logWarn("chat_publish_event_failed", { event: "message_read", error: String(err) });
  });
}

async function loadOwnedMessage(userId: string, messageId: string | undefined) {
  if (!messageId) {
    throw new HttpError(400, "BAD_REQUEST", "Message id is required");
  }
  const message = await ChatMessage.findById(messageId);
  if (!message) {
    throw new HttpError(404, "NOT_FOUND", "Message not found");
  }
  if (message.senderId.toString() !== userId) {
    throw new HttpError(403, "FORBIDDEN", "Can only modify your own messages");
  }
  return message;
}

export async function deleteMessage(userId: string, messageId: string | undefined): Promise<void> {
  const message = await loadOwnedMessage(userId, messageId);
  message.isDeleted = true;
  message.deletedAt = new Date();
  await message.save();
}

export async function editMessage(
  userId: string,
  messageId: string | undefined,
  newMessage: string | undefined,
) {
  if (!newMessage) {
    throw new HttpError(400, "BAD_REQUEST", "New message content is required");
  }
  const message = await loadOwnedMessage(userId, messageId);
  message.message = newMessage;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();
  return message;
}

/** Reflects presence on this process only — see getConnectedUserIds's own caveat
 * about horizontally-scaled deployments. */
export function getOnlineUsers(): string[] {
  return getWebSocketService()?.getConnectedUserIds() ?? [];
}
