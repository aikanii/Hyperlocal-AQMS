FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Use non-root user for security
RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000

# Run node directly for better signal handling (SIGTERM)
CMD ["node", "index.js"]
