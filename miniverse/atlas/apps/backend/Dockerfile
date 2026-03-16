FROM node:20-slim

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy workspace root
COPY package.json ./
COPY packages/ packages/
COPY apps/backend/ apps/backend/

# Install dependencies
RUN npm install --workspace=apps/backend --workspace=packages/shared --workspace=packages/ai

# Generate Prisma client
RUN npx prisma generate --schema apps/backend/prisma/schema.prisma

# Build packages
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/ai
RUN npm run build --workspace=apps/backend

EXPOSE 3001
CMD ["node", "apps/backend/dist/server.js"]
