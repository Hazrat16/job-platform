# 🚀 Advanced Chat Service Implementation

## Overview
This is a production-ready, advanced chat service built with Node.js, TypeScript, Socket.IO, RabbitMQ, and MongoDB. It provides real-time messaging, conversation management, and scalable message processing.

## ✨ Features

### Core Chat Features
- **Real-time Messaging**: WebSocket-based instant messaging
- **Conversation Management**: Direct and group chat support
- **Message Types**: Text, image, file, audio, and video support
- **Typing Indicators**: Real-time typing status
- **Read Receipts**: Message delivery and read status
- **Message History**: Paginated message retrieval
- **Search**: Full-text message search
- **Message Actions**: Edit and delete messages

### Technical Features
- **WebSocket Integration**: Socket.IO for real-time communication
- **Message Queue**: RabbitMQ for reliable message processing
- **Database Storage**: MongoDB with optimized schemas
- **Authentication**: JWT-based secure authentication
- **Error Handling**: Comprehensive error handling and logging
- **Scalability**: Designed for horizontal scaling
- **Type Safety**: Full TypeScript implementation

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │   HTTP Server   │    │  WebSocket      │
│                 │◄──►│   (Express)     │◄──►│  (Socket.IO)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   RabbitMQ      │    │   MongoDB       │
                       │   (Message      │    │   (Data Store)  │
                       │    Queue)       │    │                 │
                       └─────────────────┘    └─────────────────┘
```

## 📁 Project Structure

```
src/
├── chat/
│   ├── chatController.ts      # Chat API endpoints
│   ├── consumer.ts            # RabbitMQ message consumer
│   ├── producer.ts            # RabbitMQ message producer
│   ├── rabbitMQ.ts            # RabbitMQ service
│   ├── websocketService.ts    # WebSocket service
│   └── testClient.html        # Test client
├── models/
│   ├── chatModel.ts           # Chat message schema
│   └── conversationModel.ts   # Conversation schema
├── routes/
│   └── chatRoutes.ts          # Chat API routes
└── startChatServer.ts         # Server startup
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB
- RabbitMQ
- TypeScript

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/job-platform
   JWT_SECRET=your_jwt_secret_here
   RABBITMQ_URL=amqp://localhost
   CLIENT_URL=http://localhost:3000
   ```

3. **Start Services**
   ```bash
   # Start MongoDB
   mongod
   
   # Start RabbitMQ
   rabbitmq-server
   
   # Start the application
   npm run dev
   ```

### Testing the Chat Service

1. **Start the server**
   ```bash
   npm run dev
   ```

2. **Open the test client**
   - Navigate to `src/chat/testClient.html`
   - Enter a valid JWT token
   - Click "Connect"
   - Start testing chat functionality

## 📡 API Endpoints

### Chat Routes (`/api/chat`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/send` | Send a message |
| `GET` | `/conversation/:userId` | Get conversation with user |
| `GET` | `/conversations` | Get all conversations |
| `GET` | `/conversation/:conversationId/messages` | Get message history |
| `GET` | `/search` | Search messages |
| `POST` | `/mark-read` | Mark messages as read |
| `DELETE` | `/message/:messageId` | Delete a message |
| `PUT` | `/message/:messageId` | Edit a message |
| `GET` | `/online-users` | Get online users |

### WebSocket Events

#### Client to Server
- `send_message`: Send a chat message
- `typing_start`: Start typing indicator
- `typing_stop`: Stop typing indicator
- `mark_read`: Mark messages as read
- `join_conversation`: Join a conversation room
- `leave_conversation`: Leave a conversation room

#### Server to Client
- `message_sent`: Message sent confirmation
- `user_typing`: User typing indicator
- `messages_read`: Messages marked as read
- `conversations_loaded`: User conversations loaded
- `user_status_change`: User online/offline status
- `error`: Error messages

## 🔧 Configuration

### RabbitMQ Configuration
The service automatically sets up:
- **Queues**: `chat-messages`, `chat-notifications`, `chat-events`
- **Exchanges**: `chat.direct`, `chat.fanout`
- **Bindings**: Proper routing between queues and exchanges

### MongoDB Schemas
- **ChatMessage**: Individual message storage with metadata
- **Conversation**: Conversation management with participants

## 📊 Monitoring & Logging

### Built-in Monitoring
- Connection status tracking
- Message processing metrics
- Error logging and handling
- Performance monitoring

### Log Levels
- ✅ Success operations
- ❌ Error conditions
- 🔄 Connection status
- 📤 Message sending
- 📥 Message receiving
- 👥 User interactions

## 🚀 Scaling Considerations

### Horizontal Scaling
- Stateless WebSocket connections
- RabbitMQ clustering support
- MongoDB replica sets
- Load balancer ready

### Performance Optimizations
- Database indexing on frequently queried fields
- Message pagination
- Efficient conversation lookups
- WebSocket room management

## 🔒 Security Features

- JWT authentication for WebSocket connections
- User authorization for chat operations
- Message ownership validation
- Secure WebSocket transport

## 🧪 Testing

### Manual Testing
Use the provided `testClient.html` to test:
- WebSocket connections
- Message sending/receiving
- Typing indicators
- Real-time updates

### API Testing
Test REST endpoints using tools like:
- Postman
- Insomnia
- curl commands

## 🐛 Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check JWT token validity
   - Verify server is running
   - Check CORS configuration

2. **RabbitMQ Connection Issues**
   - Ensure RabbitMQ service is running
   - Check connection URL
   - Verify queue permissions

3. **Database Connection Issues**
   - Check MongoDB connection string
   - Verify database exists
   - Check user permissions

### Debug Mode
Enable detailed logging by setting environment variables:
```env
DEBUG=true
LOG_LEVEL=debug
```

## 🔮 Future Enhancements

### Planned Features
- **Video Streaming**: WebRTC integration
- **File Sharing**: Advanced file handling
- **Push Notifications**: Mobile push support
- **Message Encryption**: End-to-end encryption
- **Analytics**: Chat analytics and insights
- **Bot Integration**: AI-powered chat bots

### Performance Improvements
- Redis caching layer
- Message compression
- CDN integration for media
- Database query optimization

## 📚 Additional Resources

- [Socket.IO Documentation](https://socket.io/docs/)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/tutorials.html)
- [MongoDB Best Practices](https://docs.mongodb.com/manual/core/data-modeling-introduction/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

---

**Happy Chatting! 🎉**
