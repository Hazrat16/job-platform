#!/bin/bash

# Simple Chat Service Startup Script
# This script starts only the essential services without Nginx

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Simple Chat Service Startup${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Docker Compose is not installed. Please install it first."
        exit 1
    fi
}

# Start services
start_services() {
    print_status "Starting chat services (using development setup for now)..."
    
    # Check if the development compose file exists
    if [ ! -f "docker-compose.chat.dev.yml" ]; then
        echo "❌ docker-compose.chat.dev.yml not found!"
        exit 1
    fi
    
    # Start services using development setup (easier for testing)
    docker-compose -f docker-compose.chat.dev.yml up -d
    
    print_status "Waiting for services to be healthy..."
    sleep 15
    
    # Check service health
    print_status "Checking service health..."
    docker-compose -f docker-compose.chat.dev.yml ps
    
    print_status "✅ Chat services started successfully!"
    echo ""
    print_status "🌐 Access Points:"
    print_status "  • Chat API: http://localhost:5000"
    print_status "  • RabbitMQ Management: http://localhost:15673"
    print_status "    - Username: admin"
    print_status "    - Password: admin123"
    print_status "  • MongoDB: localhost:27018"
    print_status "  • Redis: localhost:6380"
    echo ""
    print_status "📝 Useful Commands:"
    print_status "  • View logs: docker-compose -f docker-compose.chat.dev.yml logs -f"
    print_status "  • Stop services: docker-compose -f docker-compose.chat.dev.yml down"
    print_status "  • Check status: docker-compose -f docker-compose.chat.dev.yml ps"
}

# Stop services
stop_services() {
    print_status "Stopping chat services..."
    docker-compose -f docker-compose.chat.dev.yml down
    print_status "✅ Chat services stopped successfully!"
}

# Show logs
show_logs() {
    print_status "Showing chat service logs..."
    docker-compose -f docker-compose.chat.dev.yml logs -f
}

# Show status
show_status() {
    print_status "Chat services status:"
    docker-compose -f docker-compose.chat.dev.yml ps
}

# Show help
show_help() {
    print_header
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start     Start chat services"
    echo "  stop      Stop chat services"
    echo "  restart   Restart chat services"
    echo "  status    Show services status"
    echo "  logs      Show services logs"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start      # Start services"
    echo "  $0 status     # Check status"
    echo "  $0 logs       # View logs"
}

# Main script logic
main() {
    check_docker
    check_docker_compose
    
    case "${1:-help}" in
        start)
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            stop_services
            sleep 2
            start_services
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "❌ Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
