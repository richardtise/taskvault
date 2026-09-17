# --- Build stage -----------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app
# /app is created by root; hand it to the unprivileged `node` user so the build
# can run as non-root.
RUN chown node:node /app

COPY --chown=node:node package*.json ./
USER node
RUN npm ci

COPY --chown=node:node . .

# Vite inlines VITE_* variables at compile time. Compose passes these from the
# repo-root .env (see docker-compose.yml); frontend/.env is gitignored and is
# excluded from the build context by frontend/.dockerignore, so it is never
# baked into the image.
ARG VITE_VAULT_ADDRESS=""
ARG VITE_USDG_ADDRESS=""
ARG VITE_ROBINHOOD_TESTNET_RPC="https://rpc.testnet.chain.robinhood.com"
ENV VITE_VAULT_ADDRESS=${VITE_VAULT_ADDRESS} \
    VITE_USDG_ADDRESS=${VITE_USDG_ADDRESS} \
    VITE_ROBINHOOD_TESTNET_RPC=${VITE_ROBINHOOD_TESTNET_RPC}

RUN npm run build

# --- Serve stage -----------------------------------------------------------
# Unprivileged nginx: runs as uid 101 (non-root) and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
