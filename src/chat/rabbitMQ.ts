import amqp, { Connection, Channel, Message } from "amqplib";

interface QueueConfig {
  name: string;
  durable: boolean;
  autoDelete: boolean;
}

interface ExchangeConfig {
  name: string;
  type: string;
  durable: boolean;
}

class RabbitMQService {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;

  // Queue configurations
  private readonly queues: QueueConfig[] = [
    { name: "chat-messages", durable: true, autoDelete: false },
    { name: "chat-notifications", durable: true, autoDelete: false },
    { name: "chat-events", durable: true, autoDelete: false },
  ];

  // Exchange configurations
  private readonly exchanges: ExchangeConfig[] = [
    { name: "chat.direct", type: "direct", durable: true },
    { name: "chat.fanout", type: "fanout", durable: true },
  ];

  async connect(): Promise<void> {
    try {
      const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
      
      console.log("🔄 Connecting to RabbitMQ...");
      this.connection = await amqp.connect(RABBITMQ_URL);
      
      this.connection.on("error", (err) => {
        console.error("❌ RabbitMQ connection error:", err);
        this.isConnected = false;
        this.handleReconnect();
      });

      this.connection.on("close", () => {
        console.warn("⚠️ RabbitMQ connection closed");
        this.isConnected = false;
        this.handleReconnect();
      });

      this.channel = await this.connection.createChannel();
      
      // Set up queues and exchanges
      await this.setupQueuesAndExchanges();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log("✅ Connected to RabbitMQ successfully");
      
    } catch (error) {
      console.error("❌ Failed to connect to RabbitMQ:", error);
      this.handleReconnect();
      throw error;
    }
  }

  private async setupQueuesAndExchanges(): Promise<void> {
    if (!this.channel) throw new Error("Channel not available");

    try {
      // Set up exchanges
      for (const exchange of this.exchanges) {
        await this.channel.assertExchange(exchange.name, exchange.type, {
          durable: exchange.durable,
        });
        console.log(`✅ Exchange '${exchange.name}' asserted`);
      }

      // Set up queues
      for (const queue of this.queues) {
        await this.channel.assertQueue(queue.name, {
          durable: queue.durable,
          autoDelete: queue.autoDelete,
        });
        console.log(`✅ Queue '${queue.name}' asserted`);
      }

      // Bind queues to exchanges
      await this.channel.bindQueue("chat-messages", "chat.direct", "message");
      await this.channel.bindQueue("chat-notifications", "chat.fanout", "");
      await this.channel.bindQueue("chat-events", "chat.fanout", "");
      
      console.log("✅ Queue bindings configured");
      
    } catch (error) {
      console.error("❌ Failed to setup queues and exchanges:", error);
      throw error;
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error("❌ Reconnection failed:", error);
      }
    }, this.reconnectDelay);
  }

  async getChannel(): Promise<Channel> {
    if (!this.channel || !this.isConnected) {
      await this.connect();
    }
    
    if (!this.channel) {
      throw new Error("Failed to get RabbitMQ channel");
    }
    
    return this.channel;
  }

  async publishToExchange(
    exchange: string,
    routingKey: string,
    message: any,
    options?: amqp.Options.Publish
  ): Promise<void> {
    try {
      const channel = await this.getChannel();
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      channel.publish(exchange, routingKey, messageBuffer, {
        persistent: true,
        ...options,
      });
      
      console.log(`📤 Message published to exchange '${exchange}' with routing key '${routingKey}'`);
    } catch (error) {
      console.error("❌ Failed to publish message:", error);
      throw error;
    }
  }

  async sendToQueue(queue: string, message: any, options?: amqp.Options.Publish): Promise<void> {
    try {
      const channel = await this.getChannel();
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      channel.sendToQueue(queue, messageBuffer, {
        persistent: true,
        ...options,
      });
      
      console.log(`📤 Message sent to queue '${queue}'`);
    } catch (error) {
      console.error("❌ Failed to send message to queue:", error);
      throw error;
    }
  }

  async consumeQueue(
    queue: string,
    callback: (message: Message | null) => void,
    options?: amqp.Options.Consume
  ): Promise<void> {
    try {
      const channel = await this.getChannel();
      
      await channel.assertQueue(queue);
      
      channel.consume(queue, (message) => {
        try {
          callback(message);
        } catch (error) {
          console.error("❌ Error in message callback:", error);
          if (message) {
            channel.nack(message, false, false);
          }
        }
      }, {
        noAck: false,
        ...options,
      });
      
      console.log(`📥 Started consuming from queue '${queue}'`);
    } catch (error) {
      console.error("❌ Failed to start consuming from queue:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.isConnected = false;
      console.log("✅ RabbitMQ connection closed");
    } catch (error) {
      console.error("❌ Error closing RabbitMQ connection:", error);
    }
  }

  isConnectionActive(): boolean {
    return this.isConnected && this.connection !== null && this.channel !== null;
  }
}

// Export singleton instance
const rabbitMQService = new RabbitMQService();
export default rabbitMQService;

// Legacy export for backward compatibility
export const connectRabbitMQ = () => rabbitMQService.connect();
export const getChannel = () => rabbitMQService.getChannel();
