# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-build
RUN apk add --no-cache git bash libc6-compat

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine
RUN apk add --no-cache git bash libc6-compat

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --production

# Copy server source
COPY server/src ./server/src

# Copy built frontend
COPY --from=frontend-build /app/client/dist ./client/dist

# Create data directory
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3377
ENV DB_PATH=/app/data/controltowarr.db

EXPOSE 3377

WORKDIR /app/server

CMD ["node", "src/index.js"]
