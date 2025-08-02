import { getChannel } from "./rabbitMQ";

export const sendMessageToQueue = async (message: object) => {
  const channel = getChannel();
  const queue = "chat-messages";

  await channel.assertQueue(queue);
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
};
