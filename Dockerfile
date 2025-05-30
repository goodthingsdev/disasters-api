# Use official Node.js LTS image (Debian-based for mongodb-memory-server compatibility)
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --force

# Install nodemon globally for hot-reloading
RUN npm install -g nodemon

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Use environment variables for configuration
ENV NODE_ENV=development

# Start the app with nodemon for real-time reloads
CMD ["nodemon", "index.js"]

# Add Docker healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1
