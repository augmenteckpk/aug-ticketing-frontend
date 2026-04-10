# ---- build ----
FROM node:22-alpine AS builder

WORKDIR /app

# Angular bakes `environment.ts` at build time — set in Coolify under "Build Arguments".
# Prefer API_URL. VITE_API_URL is accepted so existing prod configs from the old Vite image still work.
ARG API_URL=
ARG VITE_API_URL=
ENV API_URL=${API_URL}
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node -e "const fs=require('fs');const a=(process.env.API_URL||'').trim();const v=(process.env.VITE_API_URL||'').trim();const u=a||v||'http://localhost:3001';const j='export const environment = {\n  production: true,\n  apiUrl: '+JSON.stringify(u)+',\n};\n';fs.writeFileSync('src/environments/environment.ts',j);"
RUN npm run build

# ---- run ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/web/browser /usr/share/nginx/html

EXPOSE 80
