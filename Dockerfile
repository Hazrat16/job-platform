# Base image
FROM node:20-alpine AS base
RUN apk update && apk upgrade
WORKDIR /app

# Copy package files & install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Create non-root user and set permissions
RUN adduser -u 5678 --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

EXPOSE 5173

# Development stage
FROM base AS development
CMD ["npm", "run", "dev"]

# Build stage (for client apps, SSR, etc.)
FROM base AS build
RUN npm run build

# Production stage
FROM base AS production
RUN npm ci --only=production
CMD ["npm", "run", "start"]
