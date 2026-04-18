import mongoose, { Document, Schema, Types } from "mongoose";

export type PaymentStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";

export interface IPayment extends Document {
  user: Types.ObjectId;
  tranId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  purpose: string;
  valId?: string;
  sessionKey?: string;
  bankTranId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tranId: { type: String, required: true, unique: true, trim: true, maxlength: 30 },
    amount: { type: Number, required: true, min: 10, max: 500_000 },
    currency: { type: String, required: true, default: "BDT", uppercase: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
      required: true,
      index: true,
    },
    purpose: { type: String, default: "wallet_topup", trim: true },
    valId: { type: String, trim: true },
    sessionKey: { type: String, trim: true },
    bankTranId: { type: String, trim: true },
  },
  { timestamps: true },
);

paymentSchema.index({ user: 1, createdAt: -1 });

const Payment = mongoose.model<IPayment>("Payment", paymentSchema);

export default Payment;
