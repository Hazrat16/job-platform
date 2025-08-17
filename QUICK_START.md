# 🚀 Quick Start Guide - Chat Service

## 🎯 **Simple Setup (No Nginx)**

This guide will help you start the chat service with just the essential services: MongoDB, RabbitMQ, Redis, and your Node.js app.

## 📋 **Prerequisites**

- ✅ Docker Engine 20.10+
- ✅ Docker Compose 2.0+
- ✅ At least 4GB RAM available

## 🚀 **Step 1: Start the Services**

### **Option A: Using the Simple Script (Recommended)**

```bash
# Make script executable (if not already done)
chmod +x scripts/start-chat-simple.sh

# Start all services
./scripts/start-chat-simple.sh start
```

### **Option B: Manual Docker Compose**

```bash
# Start services
docker-compose -f docker-compose.chat.simple.yml up -d

# Check status
docker-compose -f docker-compose.chat.simple.yml ps
```

## 🌐 **Step 2: Access Your Services**

| Service                 | URL                    | Credentials    |
| ----------------------- | ---------------------- | -------------- |
| **Chat API**            | http://localhost:5000  | -              |
| **RabbitMQ Management** | http://localhost:15672 | admin/admin123 |
| **MongoDB**             | localhost:27017        | admin/admin123 |
| **Redis**               | localhost:6379         | -              |

## 🧪 **Step 3: Test the Chat Service**

### **1. Test the API**

```bash
# Test if the service is running
curl http://localhost:5000/api/test
```

### **2. Test WebSocket Connection**

- Open `src/chat/testClient.html` in your browser
- Enter a valid JWT token
- Click "Connect"
- Start testing real-time chat!

### **3. Check RabbitMQ Management**

- Open http://localhost:15672
- Login with admin/admin123
- Check if queues are created

## 📊 **Step 4: Monitor Services**

### **View Logs**

```bash
# View all logs
./scripts/start-chat-simple.sh logs

# Or manually
docker-compose -f docker-compose.chat.simple.yml logs -f
```

### **Check Status**

```bash
# Check service status
./scripts/start-chat-simple.sh status

# Or manually
docker-compose -f docker-compose.chat.simple.yml ps
```

### **Resource Usage**

```bash
# View Docker stats
docker stats
```

## 🛑 **Step 5: Stop Services**

### **Using Script**

```bash
./scripts/start-chat-simple.sh stop
```

### **Manual**

```bash
docker-compose -f docker-compose.chat.simple.yml down
```

## 🔧 **Troubleshooting**

### **Common Issues**

#### **1. Port Already in Use**

```bash
# Check what's using port 5000
sudo netstat -tlnp | grep :5000

# Kill the process
sudo kill -9 <PID>
```

#### **2. Services Not Starting**

```bash
# Check logs
docker-compose -f docker-compose.chat.simple.yml logs

# Check Docker status
docker info
```

#### **3. Permission Issues**

```bash
# Fix script permissions
chmod +x scripts/start-chat-simple.sh

# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

### **Reset Everything**

```bash
# Stop and remove everything
docker-compose -f docker-compose.chat.simple.yml down -v

# Remove volumes
docker volume prune -f

# Start fresh
./scripts/start-chat-simple.sh start
```

## 📝 **Useful Commands**

```bash
# Start services
./scripts/start-chat-simple.sh start

# Stop services
./scripts/start-chat-simple.sh stop

# Restart services
./scripts/start-chat-simple.sh restart

# Check status
./scripts/start-chat-simple.sh status

# View logs
./scripts/start-chat-simple.sh logs

# Get help
./scripts/start-chat-simple.sh help
```

## 🔮 **Future: Adding Nginx**

When you're ready to add Nginx:

1. **Study the Nginx configuration** in `docker/nginx/nginx.conf`
2. **Uncomment the Nginx service** in `docker-compose.chat.yml`
3. **Update the management scripts** to include Nginx
4. **Test the reverse proxy** functionality

## 📚 **Next Steps**

1. ✅ **Start the basic services** (you're here!)
2. 🔄 **Test the chat functionality**
3. 🧪 **Run the test client**
4. 📊 **Monitor performance**
5. 🔒 **Configure security** (change default passwords)
6. 🚀 **Deploy to production**

## 🆘 **Need Help?**

- Check the logs: `./scripts/start-chat-simple.sh logs`
- Verify Docker is running: `docker info`
- Check service health: `./scripts/start-chat-simple.sh status`
- Review the full documentation: `DOCKER_README.md`

---

**🎉 You're all set! Your advanced chat service is now running with Docker! 🐳💬**
