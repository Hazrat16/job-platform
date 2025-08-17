import amqp from "amqplib";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost"; // Use env var or fallback to localhost
let channel: amqp.Channel;

export const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    console.log("✅ Connected to RabbitMQ");
    
    // Handle connection close
    connection.on('close', () => {
      console.log('❌ RabbitMQ connection closed');
    });
    
    connection.on('error', (err) => {
      console.log('❌ RabbitMQ connection error:', err);
    });
    
  } catch (error) {
    console.log('❌ Failed to connect to RabbitMQ:', error);
    throw error;
  }
};

export const getChannel = () => channel;
