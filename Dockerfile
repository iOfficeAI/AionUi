FROM node:20-slim
WORKDIR /app

# Install bun
RUN npm install -g bun

# Copy source and install production dependencies
COPY package.json bun.lockb ./
RUN bun install --production

# Copy remaining source
COPY . .

# Build standalone server bundle
RUN bun build src/server.ts --outdir dist-server --target node

ENV PORT=3000
ENV ALLOW_REMOTE=true

# SQLite data volume — mount with: -v $(pwd)/data:/data -e DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist-server/server.js"]
