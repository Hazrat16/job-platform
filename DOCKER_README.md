# 🐳 Docker Setup for Advanced Chat Service

## Overview

This Docker setup provides a complete, production-ready environment for the advanced chat service with MongoDB, RabbitMQ, Redis, and the Node.js application.

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx Proxy   │    │   Chat App      │    │   MongoDB       │
│   (Port 80/443) │◄──►│   (Port 5000)   │◄──►│   (Port 27017)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   RabbitMQ      │    │   Redis         │
                       │   (Port 5672)   │    │   (Port 6379)   │
                       └─────────────────┘    └─────────────────┘
```

## 📁 Files Structure

```
├── docker-compose.chat.yml          # Production compose file
├── docker-compose.chat.dev.yml      # Development compose file
├── Dockerfile.chat                   # Production Dockerfile
├── Dockerfile.chat.dev              # Development Dockerfile
├── docker/
│   ├── mongo/
│   │   └── init/
│   │       └── init-mongo.js        # MongoDB initialization
│   └── nginx/
│       └── nginx.conf               # Nginx configuration
├── scripts/
│   └── chat-service.sh              # Management script
└── DOCKER_README.md                 # This file
```

## 🚀 Quick Start

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 4GB RAM available

### 1. Start Development Environment

```bash
# Make the script executable
chmod +x scripts/chat-service.sh

# Start development services
./scripts/chat-service.sh dev
```

### 2. Start Production Environment

```bash
# Start production services
./scripts/chat-service.sh start
```

### 3. Check Status

```bash
# Check development services
./scripts/chat-service.sh dev-status

# Check production services
./scripts/chat-service.sh status
```

## 🔧 Service Management

### Using the Management Script

```bash
# Development commands
./scripts/chat-service.sh dev          # Start development
./scripts/chat-service.sh dev-stop     # Stop development
./scripts/chat-service.sh dev-status   # Check development status
./scripts/chat-service.sh dev-logs     # Show development logs

# Production commands
./scripts/chat-service.sh start        # Start production
./scripts/chat-service.sh stop         # Stop production
./scripts/chat-service.sh restart      # Restart production
./scripts/chat-service.sh status       # Check production status
./scripts/chat-service.sh logs         # Show production logs

# Utility commands
./scripts/chat-service.sh clean        # Clean up everything
./scripts/chat-service.sh help         # Show help
```

### Manual Docker Compose Commands

```bash
# Development
docker-compose -f docker-compose.chat.dev.yml up -d
docker-compose -f docker-compose.chat.dev.yml down

# Production
docker-compose -f docker-compose.chat.yml up -d
docker-compose -f docker-compose.chat.yml down
```

## 🌐 Access Points

### Development Environment

| Service             | URL                    | Credentials    |
| ------------------- | ---------------------- | -------------- |
| Chat API            | http://localhost:5000  | -              |
| RabbitMQ Management | http://localhost:15672 | admin/admin123 |
| MongoDB             | localhost:27017        | admin/admin123 |
| Redis               | localhost:6379         | -              |

### Production Environment

| Service             | URL                    | Credentials    |
| ------------------- | ---------------------- | -------------- |
| Chat API            | http://localhost:5000  | -              |
| RabbitMQ Management | http://localhost:15672 | admin/admin123 |
| MongoDB             | localhost:27017        | admin/admin123 |
| Redis               | localhost:6379         | -              |
| Nginx Proxy         | http://localhost:80    | -              |

## 🔍 Monitoring & Debugging

### View Logs

```bash
# Development logs
./scripts/chat-service.sh dev-logs

# Production logs
./scripts/chat-service.sh logs

# Specific service logs
docker-compose -f docker-compose.chat.dev.yml logs -f chat_app_dev
docker-compose -f docker-compose.chat.dev.yml logs -f mongodb
docker-compose -f docker-compose.chat.dev.yml logs -f rabbitmq
```

### Health Checks

```bash
# Check service health
docker-compose -f docker-compose.chat.dev.yml ps

# Check individual service health
docker inspect chat_mongodb_dev | grep Health -A 10
docker inspect chat_rabbitmq_dev | grep Health -A 10
docker inspect chat_app_dev | grep Health -A 10
```

### Resource Usage

```bash
# View resource usage
docker stats

# View disk usage
docker system df
```

## 🛠️ Development Workflow

### 1. Start Development Environment

```bash
./scripts/chat-service.sh dev
```

### 2. Make Code Changes

- Edit files in `src/` directory
- Changes are automatically reflected due to volume mounting

### 3. View Logs

```bash
./scripts/chat-service.sh dev-logs
```

### 4. Stop Development Environment

```bash
./scripts/chat-service.sh dev-stop
```

## 🚀 Production Deployment

### 1. Environment Variables

Create a `.env` file for production:

```env
NODE_ENV=production
JWT_SECRET=your_production_jwt_secret
MONGODB_URI=mongodb://admin:admin123@mongodb:27017/job-platform?authSource=admin
RABBITMQ_URL=amqp://admin:admin123@rabbitmq:5672
REDIS_URL=redis://redis:6379
```

### 2. Start Production Services

```bash
./scripts/chat-service.sh start
```

### 3. Monitor Services

```bash
./scripts/chat-service.sh status
./scripts/chat-service.sh logs
```

## 🔒 Security Considerations

### Default Credentials

- **MongoDB**: admin/admin123
- **RabbitMQ**: admin/admin123
- **Redis**: No authentication (internal network only)

### Change Default Credentials

1. Update environment variables in compose files
2. Update MongoDB initialization script
3. Rebuild and restart services

### Network Security

- Services communicate over internal Docker network
- Only necessary ports exposed to host
- Nginx provides additional security layer

## 📊 Performance Tuning

### MongoDB

```yaml
# Add to docker-compose.chat.yml
mongodb:
  environment:
    - MONGO_INITDB_ROOT_USERNAME=admin
    - MONGO_INITDB_ROOT_PASSWORD=admin123
  command: mongod --wiredTigerCacheSizeGB 1
```

### RabbitMQ

```yaml
# Add to docker-compose.chat.yml
rabbitmq:
  environment:
    - RABBITMQ_ERLANG_COOKIE=SWQOKODSQALRPCLNMEQG
    - RABBITMQ_NODE_TYPE=stats
    - RABBITMQ_NODE_NAME=rabbit@localhost
```

### Redis

```yaml
# Add to docker-compose.chat.yml
redis:
  command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Port Already in Use

```bash
# Check what's using the port
sudo netstat -tlnp | grep :5000

# Kill the process
sudo kill -9 <PID>
```

#### 2. Permission Denied

```bash
# Fix script permissions
chmod +x scripts/chat-service.sh

# Fix Docker permissions
sudo usermod -aG docker $USER
# Log out and back in
```

#### 3. Services Not Starting

```bash
# Check Docker logs
docker-compose -f docker-compose.chat.dev.yml logs

# Check service health
docker-compose -f docker-compose.chat.dev.yml ps
```

#### 4. Database Connection Issues

```bash
# Check MongoDB status
docker exec chat_mongodb_dev mongosh --eval "db.adminCommand('ping')"

# Check RabbitMQ status
docker exec chat_rabbitmq_dev rabbitmq-diagnostics ping
```

### Debug Mode

```bash
# Start with debug logging
DEBUG=true docker-compose -f docker-compose.chat.dev.yml up

# View detailed logs
docker-compose -f docker-compose.chat.dev.yml logs -f --tail=100
```

## 🔄 Updates & Maintenance

### Update Images

```bash
# Pull latest images
docker-compose -f docker-compose.chat.yml pull

# Restart services
./scripts/chat-service.sh restart
```

### Backup Data

```bash
# Backup MongoDB
docker exec chat_mongodb mongodump --out /backup

# Backup RabbitMQ (if needed)
docker exec chat_rabbitmq rabbitmqctl export_definitions > rabbitmq_backup.json
```

### Clean Up

```bash
# Remove unused containers, networks, and images
docker system prune -a

# Clean up everything
./scripts/chat-service.sh clean
```

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Docker Guide](https://hub.docker.com/_/mongo)
- [RabbitMQ Docker Guide](https://hub.docker.com/_/rabbitmq)
- [Redis Docker Guide](https://hub.docker.com/_/redis)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Docker setup
5. Submit a pull request

---

**Happy Docker Chatting! 🐳💬**
