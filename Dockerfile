FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend ./frontend
RUN npm run build --prefix frontend

FROM node:22-bookworm-slim

ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm ci --omit=dev --prefix backend
COPY backend ./backend
COPY ml ./ml
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

WORKDIR /app/backend
CMD ["npm", "start"]