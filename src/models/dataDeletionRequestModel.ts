import mongoose, { Document, Schema, Types } from "mongoose";

export interface IDataDeletionRequest extends Document {
  userId: Types.ObjectId;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "processed";
  requestedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const dataDeletionRequestSchema = new Schema<IDataDeletionRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reason: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "processed"],
      default: "pending",
      index: true,
    },
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

dataDeletionRequestSchema.index({ userId: 1, createdAt: -1 });

const DataDeletionRequest = mongoose.model<IDataDeletionRequest>(
  "DataDeletionRequest",
  dataDeletionRequestSchema,
);

export default DataDeletionRequest;
