# Estapa 1: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm ci

# Copiar código fuente
COPY . .

# Limpiar dependencias para dejar solo producción
RUN npm prune --production

# Etapa 2: Runner (Imagen Final Minimalista)
FROM node:22-alpine AS runner
WORKDIR /app

# Crear usuario no-root p ara seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiar solo lo necesario desde el builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copiar archivos (SIN OFUSCACIÓN, COPIA DIRECTA)
COPY --from=builder /app/index.mjs ./index.mjs
COPY --from=builder /app/indexing.mjs ./indexing.mjs
COPY --from=builder /app/algorand-failover.mjs ./algorand-failover.mjs
COPY --from=builder /app/db.mjs ./db.mjs
COPY --from=builder /app/auth-routes.mjs ./auth-routes.mjs
COPY --from=builder /app/microsoft-auth.mjs ./microsoft-auth.mjs


# Copiar otros archivos necesarios si los hay (helpers, etc)
COPY --from=builder /app/algorand.mjs ./algorand.mjs 

# Crear directorios necesarios con permisos correctos
RUN mkdir -p uploads && chown nodejs:nodejs uploads

# Cambiar al usuario seguro
USER nodejs

# Variables de entorno por defecto (deben ser sobreescritas por docker-compose)
ENV PORT=4000
ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "index.mjs"]
