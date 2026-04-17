import mongoose, { Document, Schema } from "mongoose";

export interface IConversation extends Document {
  participants: mongoose.Types.ObjectId[];
  lastMessage?: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  unreadCount: Map<string, number>;
  isGroupChat: boolean;
  groupName?: string;
  groupAvatar?: string;
  groupAdmin?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  addParticipant(userId: mongoose.Types.ObjectId): void;
  removeParticipant(userId: mongoose.Types.ObjectId): void;
  incrementUnreadCount(userId: mongoose.Types.ObjectId): void;
  markAsRead(userId: mongoose.Types.ObjectId): void;
}

const conversationSchema = new Schema<IConversation>({
  participants: [{
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  }],
  lastMessage: {
    type: Schema.Types.ObjectId,
    ref: "ChatMessage",
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: {},
  },
  isGroupChat: {
    type: Boolean,
    default: false,
  },
  groupName: {
    type: String,
    trim: true,
  },
  groupAvatar: {
    type: String,
  },
  groupAdmin: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
}, {
  timestamps: true,
});

// Index for efficient querying
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

// Virtual for conversation type
conversationSchema.virtual("conversationType").get(function() {
  return this.isGroupChat ? "group" : "direct";
});

// Method to add participant
conversationSchema.methods.addParticipant = function(userId: mongoose.Types.ObjectId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    this.unreadCount.set(userId.toString(), 0);
  }
};

// Method to remove participant
conversationSchema.methods.removeParticipant = function(userId: mongoose.Types.ObjectId) {
  this.participants = this.participants.filter(id => !id.equals(userId));
  this.unreadCount.delete(userId.toString());
};

// Method to increment unread count
conversationSchema.methods.incrementUnreadCount = function(userId: mongoose.Types.ObjectId) {
  const currentCount = this.unreadCount.get(userId.toString()) || 0;
  this.unreadCount.set(userId.toString(), currentCount + 1);
};

// Method to mark as read
conversationSchema.methods.markAsRead = function(userId: mongoose.Types.ObjectId) {
  this.unreadCount.set(userId.toString(), 0);
};

export default mongoose.model<IConversation>("Conversation", conversationSchema);
