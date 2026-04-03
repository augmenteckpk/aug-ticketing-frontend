# ---- build ----
FROM node:22-alpine AS builder

WORKDIR /app

# Vite inlines VITE_* at build time — set this in Coolify under "Build Arguments"
# Example: VITE_API_URL=https://api.yourdomain.com
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- run ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
