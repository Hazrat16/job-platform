import { Request, Response } from "express";
import { sendMessageToQueue } from "./producer";

const sendChatMessage = async (req: Request, res: Response) => {
  const { senderId, receiverId, message } = req.body;

  await sendMessageToQueue({
    senderId,
    receiverId,
    message,
    timestamp: new Date(),
  });

  res.json({ status: "sent" });
};

export default sendChatMessage;
