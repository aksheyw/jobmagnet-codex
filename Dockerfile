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
COPY template ./template

RUN npx tsc

# Template lives inside the container image (not bind-mounted) so a
# template rebuild requires a `docker compose build` — explicit, no
# silent drift.
ENV JOBMAGNET_TEMPLATE_DIR=/opt/app/template
ENV JOBMAGNET_JOBS_DIR=/var/jobmagnet/jobs

EXPOSE 8443

CMD ["node", "--enable-source-maps", "dist/server.js"]
