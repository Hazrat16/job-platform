#!/bin/bash

# Chat Service Management Script
# Usage: ./scripts/chat-service.sh [start|stop|restart|status|logs|clean|dev|prod]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEV_COMPOSE_FILE="docker-compose.chat.dev.yml"
PROD_COMPOSE_FILE="docker-compose.chat.simple.yml"
SERVICE_NAME="chat-service"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Chat Service Management${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install it first."
        exit 1
    fi
}

# Function to start services
start_services() {
    local compose_file=$1
    local mode=$2
    
    print_status "Starting $mode chat services..."
    
    if [ ! -f "$compose_file" ]; then
        print_error "Compose file $compose_file not found!"
        exit 1
    fi
    
    docker-compose -f "$compose_file" up -d
    
    print_status "Waiting for services to be healthy..."
    sleep 10
    
    # Check service health
    if docker-compose -f "$compose_file" ps | grep -q "unhealthy"; then
        print_warning "Some services are unhealthy. Check logs with: ./scripts/chat-service.sh logs"
    else
        print_status "All services are running and healthy!"
    fi
    
    print_status "$mode chat services started successfully!"
    print_status "Access points:"
    print_status "  - Chat API: http://localhost:5000"
    print_status "  - RabbitMQ Management: http://localhost:15672 (admin/admin123)"
    print_status "  - MongoDB: localhost:27017"
    print_status "  - Redis: localhost:6379"
}

# Function to stop services
stop_services() {
    local compose_file=$1
    local mode=$2
    
    print_status "Stopping $mode chat services..."
    docker-compose -f "$compose_file" down
    print_status "$mode chat services stopped successfully!"
}

# Function to show service status
show_status() {
    local compose_file=$1
    local mode=$2
    
    print_status "$mode chat services status:"
    echo ""
    docker-compose -f "$compose_file" ps
    echo ""
    
    # Show resource usage
    print_status "Resource usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
}

# Function to show logs
show_logs() {
    local compose_file=$1
    local mode=$2
    
    print_status "Showing $mode chat services logs..."
    docker-compose -f "$compose_file" logs -f
}

# Function to clean up
cleanup() {
    print_warning "This will remove all containers, volumes, and networks. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        print_status "Cleaning up all chat services..."
        
        # Stop and remove containers
        docker-compose -f "$DEV_COMPOSE_FILE" down -v 2>/dev/null || true
        docker-compose -f "$PROD_COMPOSE_FILE" down -v 2>/dev/null || true
        
        # Remove volumes
        docker volume rm $(docker volume ls -q | grep chat) 2>/dev/null || true
        
        # Remove networks
        docker network rm $(docker network ls -q | grep chat) 2>/dev/null || true
        
        print_status "Cleanup completed!"
    else
        print_status "Cleanup cancelled."
    fi
}

# Function to show help
show_help() {
    print_header
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start     Start production chat services"
    echo "  stop      Stop production chat services"
    echo "  restart   Restart production chat services"
    echo "  status    Show production services status"
    echo "  logs      Show production services logs"
    echo "  dev       Start development chat services"
    echo "  dev-stop  Stop development chat services"
    echo "  dev-logs  Show development services logs"
    echo "  clean     Clean up all containers and volumes"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start      # Start production services"
    echo "  $0 dev        # Start development services"
    echo "  $0 status     # Show production status"
    echo "  $0 logs       # Show production logs"
}

# Main script logic
main() {
    check_docker
    check_docker_compose
    
    case "${1:-help}" in
        start)
            start_services "$PROD_COMPOSE_FILE" "production"
            ;;
        stop)
            stop_services "$PROD_COMPOSE_FILE" "production"
            ;;
        restart)
            stop_services "$PROD_COMPOSE_FILE" "production"
            sleep 2
            start_services "$PROD_COMPOSE_FILE" "production"
            ;;
        status)
            show_status "$PROD_COMPOSE_FILE" "production"
            ;;
        logs)
            show_logs "$PROD_COMPOSE_FILE" "production"
            ;;
        dev)
            start_services "$DEV_COMPOSE_FILE" "development"
            ;;
        dev-stop)
            stop_services "$DEV_COMPOSE_FILE" "development"
            ;;
        dev-status)
            show_status "$DEV_COMPOSE_FILE" "development"
            ;;
        dev-logs)
            show_logs "$DEV_COMPOSE_FILE" "development"
            ;;
        clean)
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
