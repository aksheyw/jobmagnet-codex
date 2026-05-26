FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex@0.133.0 \
    && codex --version

WORKDIR /opt/app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY server.ts ./
COPY routes ./routes
COPY agents ./agents
COPY lib ./lib
COPY schemas ./schemas

RUN npx tsc

EXPOSE 8443

CMD ["node", "--enable-source-maps", "dist/server.js"]
