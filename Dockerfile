# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p data \
    && chown -R app:app /app

USER app

EXPOSE 4000

CMD ["npm", "start"]
