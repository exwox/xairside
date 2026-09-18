# Environment Configuration Guide

X-AIRSIDE MONITORING menggunakan file `.env` untuk mengatur konfigurasi aplikasi. Berikut adalah panduan lengkap untuk setup environment.

## Quick Start

1. **Development Environment:**
   ```bash
   # File .env sudah tersedia dengan konfigurasi default
   npm install
   npx prisma db push
   npx prisma db seed
   npm run dev
   ```

2. **Production Environment:**
   ```bash
   cp .env.production .env
   # Edit .env dengan kredensial production Anda
   npm run build
   npm start
   ```

## File Environment

### `.env` (Development)
File ini digunakan untuk development local. Sudah tercakup dalam repository dengan nilai-nilai default.

**Default values:**
- `PORT=2026` - Server berjalan di port 2026
- `NODE_ENV=development` - Mode development
- `DATABASE_URL="file:./dev.db"` - SQLite local database

### `.env.example`
Template file yang menunjukkan semua konfigurasi yang tersedia. Gunakan ini sebagai referensi.

### `.env.production`
Template untuk production deployment. **Jangan commit ke repository!**

## Environment Variables

### Database Configuration

| Variable | Development | Production | Deskripsi |
|----------|-------------|-----------|-----------|
| `DATABASE_URL` | `file:./dev.db` | PostgreSQL connection string | Database connection |

**Example PostgreSQL:**
```
DATABASE_URL=postgresql://username:password@localhost:5432/xairside
```

### Server Configuration

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `PORT` | `2026` | Port server Next.js |
| `NODE_ENV` | `development` | Node environment (development/production) |

### Next.js Configuration

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:2026` | Public API URL (client-side accessible) |

### Authentication

| Variable | Deskripsi | Requirement |
|----------|-----------|------------|
| `NEXTAUTH_SECRET` | Secret key untuk session encryption | **WAJIB** di production |

### Application Security

| Variable | Min Length | Deskripsi |
|----------|----------|-----------|
| `XAIRSIDE_SEED_PASSWORD` | 12 characters | Password initial admin user |

## Setup Instructions

### 1. Development Setup

```bash
# Konfigurasi sudah ready di .env
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

Server berjalan di `http://localhost:2026`

### 2. Production Setup

```bash
cp .env.production .env
nano .env  # Edit dengan kredensial production

npm install
npx prisma generate
npm run build
npx prisma migrate deploy
npx prisma db seed
npm start
```

### 3. Docker Setup

```bash
docker run -e NODE_ENV=production \
  -e PORT=2026 \
  -e DATABASE_URL=postgresql://user:pass@db:5432/xairside \
  -e NEXTAUTH_SECRET=your-secret-key \
  -e XAIRSIDE_SEED_PASSWORD=SecurePassword123 \
  xairside:latest
```

## Security Best Practices

### Production Checklist

- [ ] Generate NEXTAUTH_SECRET: `openssl rand -base64 32`
- [ ] Use strong DATABASE_URL password
- [ ] XAIRSIDE_SEED_PASSWORD: min 12 chars with uppercase, lowercase, numbers, symbols
- [ ] NODE_ENV set to `production`
- [ ] Jangan commit `.env` ke repository
- [ ] Configure `.gitignore`:

```
.env
.env.local
.env.production
.env.*.local
dev.db
dev.db-shm
dev.db-wal
```

## Troubleshooting

### Database Connection Error
```
Error: ENOENT: no such file or directory, open 'dev.db'
```
Solution: `npx prisma db push`

### Seed Password Error
```
Error: XAIRSIDE_SEED_PASSWORD minimal 12 karakter
```
Solution: Update `XAIRSIDE_SEED_PASSWORD` di `.env`

### Port Already in Use
```
Error: listen EADDRINUSE :::2026
```
Solution: Change `PORT` atau kill process: `lsof -i :2026`

