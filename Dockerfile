FROM node:24-slim

WORKDIR /app

# Install system dependencies required by Prisma
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl && rm -rf /var/lib/apt/lists/*

# Copy all files first (including prisma schema)
COPY . .

# Install dependencies with postinstall script
RUN npm install --legacy-peer-deps 2>&1 || npm install --legacy-peer-deps --force

# Build application
RUN npm run build

EXPOSE 2026

ENV PORT=2026
ENV NODE_ENV=production

# Start Next.js with db push instead of migrate deploy for fresh setups
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx prisma db seed && npm start"]
