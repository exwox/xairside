FROM node:24-alpine

WORKDIR /app

# Install dependencies first (leverages caching)
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build application
RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start Next.js
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
