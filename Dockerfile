# ---- build ----
FROM node:22-alpine AS builder

WORKDIR /app

# Angular bakes `environment.ts` at build time — set in Coolify under "Build Arguments"
# Example: API_URL=https://api.yourdomain.com
ARG API_URL=http://localhost:3001
ENV API_URL=${API_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node -e "const fs=require('fs');const u=process.env.API_URL||'';const j='export const environment = {\n  production: true,\n  apiUrl: '+JSON.stringify(u)+',\n};\n';fs.writeFileSync('src/environments/environment.ts',j);"
RUN npm run build

# ---- run ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/web/browser /usr/share/nginx/html

EXPOSE 80
