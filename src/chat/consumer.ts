import { getChannel } from "./rabbitMQ";

export const consumeMessages = async () => {
  const channel = getChannel();
  const queue = "chat-messages";

  await channel.assertQueue(queue);

  channel.consume(queue, (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      console.log("📩 Received message:", content);

      // TODO: Save to DB or broadcast via WebSocket
      channel.ack(msg);
    }
  });
};
