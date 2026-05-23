FROM node:20-slim AS builder

# Install build dependencies for canvas and Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango-1.0-0 \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    libfreetype6-dev \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Remove development dependencies to keep node_modules light
RUN npm prune --omit=dev

FROM node:20-slim AS runner

# Install runtime dependencies for canvas and Chromium for whatsapp-web.js
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    libcairo2 \
    libpango-1.0-0 \
    libpango1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    libfreetype6 \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3010
CMD ["node", "dist/index.js"]
