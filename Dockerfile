# Video Commerce Intelligence MCP Server
# Runs as an SSE MCP server for remote deployment.
#
# Build:   docker build -t video-commerce-mcp .
# Run:     docker run -p 3001:3001 -e OPENAI_API_KEY=sk-... video-commerce-mcp
# Health:  curl http://localhost:3001/health

FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Production image ---
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output and data
COPY --from=builder /app/dist/ ./dist/
COPY data/ ./data/

# Non-root user for security
RUN addgroup -g 1001 -S mcp && \
    adduser -S mcp -u 1001 -G mcp && \
    mkdir -p /home/mcp/.video-commerce-mcp && \
    chown -R mcp:mcp /home/mcp/.video-commerce-mcp

USER mcp

# Default cache directory
ENV ANALYSIS_CACHE_DIR=/home/mcp/.video-commerce-mcp

# Expose SSE port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start SSE server
CMD ["node", "dist/cli.js", "--transport", "sse", "--port", "3001"]
