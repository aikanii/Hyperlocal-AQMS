# Stage 1: Build React dashboard (Vite)
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies (lockfile required for reproducible CI builds)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Production bundle (needs devDependencies from npm ci above)
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# Stage 2: Serve with Nginx + SSL
FROM nginx:alpine

RUN apk add --no-cache openssl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

# Normalize Windows CRLF line endings if present
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
