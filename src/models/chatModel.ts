import mongoose, { Document, Schema } from "mongoose";

export interface IChatMessage extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  message: string;
  messageType: "text" | "image" | "file" | "audio" | "video";
  timestamp: Date;
  isRead: boolean;
  readAt?: Date;
  attachments?: string[];
  replyTo?: mongoose.Types.ObjectId;
  editedAt?: Date;
  isEdited: boolean;
  deletedAt?: Date;
  isDeleted: boolean;
}

const chatMessageSchema = new Schema<IChatMessage>({
  senderId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  receiverId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  messageType: {
    type: String,
    enum: ["text", "image", "file", "audio", "video"],
    default: "text",
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
  },
  attachments: [{
    type: String,
  }],
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: "ChatMessage",
  },
  editedAt: {
    type: Date,
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
});

// Compound index for efficient querying of conversations
chatMessageSchema.index({ senderId: 1, receiverId: 1, timestamp: -1 });
chatMessageSchema.index({ receiverId: 1, senderId: 1, timestamp: -1 });

// Virtual for conversation ID (unique identifier for a pair of users)
chatMessageSchema.virtual("conversationId").get(function() {
  const sortedIds = [this.senderId.toString(), this.receiverId.toString()].sort();
  return `${sortedIds[0]}-${sortedIds[1]}`;
});

export default mongoose.model<IChatMessage>("ChatMessage", chatMessageSchema);
