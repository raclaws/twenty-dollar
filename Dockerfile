# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Runtime (binary pre-compiled on host or CI)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY target/release/twenty-dollar /app/twenty-dollar
COPY --from=frontend /app/frontend/dist /app/static

ENV DATABASE_PATH=/app/data/twenty_dollar.db
ENV STATIC_DIR=/app/static
ENV RUST_LOG=twenty_dollar=info,tower_http=info

EXPOSE 3001

VOLUME ["/app/data"]

CMD ["/app/twenty-dollar"]
