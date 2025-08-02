import amqp from "amqplib";

const RABBITMQ_URL = "amqp://localhost"; // or your RabbitMQ host
let channel: amqp.Channel;

export const connectRabbitMQ = async () => {
  const connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();
  console.log("✅ Connected to RabbitMQ");
};

export const getChannel = () => channel;
