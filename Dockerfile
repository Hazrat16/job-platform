# syntax=docker/dockerfile:1
FROM node:18-alpine AS development

WORKDIR /app

# Copy both files
COPY package.json package-lock.json ./

# Install deps
RUN npm ci

# Copy all source files
COPY . .

# Expose port
EXPOSE 5000

CMD ["npm", "run", "dev"]
