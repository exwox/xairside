# Docker Compose Setup Guide

Panduan lengkap untuk menjalankan X-AIRSIDE MONITORING menggunakan Docker Compose dengan PostgreSQL.

## Prerequisites

- Docker Desktop atau Docker Engine (version 20.10+)
- Docker Compose (version 1.29+)
- Minimal 2GB RAM untuk containers

## Quick Start

```bash
cd /path/to/xairside
cp .env.docker .env.local
docker-compose up -d
docker-compose ps
docker-compose logs -f web
```

Aplikasi akan berjalan di `http://localhost:2026`

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Docker Compose Network                   │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │  xairside-app (Next.js)                  │  │
│  │  Port: 2026                              │  │
│  └──────────────────────────────────────────┘  │
│                    ↓                            │
│  ┌──────────────────────────────────────────┐  │
│  │  xairside-db (PostgreSQL 16)             │  │
│  │  Port: 5432                              │  │
│  │  Volume: postgres_data (persistent)      │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Database Management

### Backup Database

```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U xairside xairside > backup.sql

# Backup dengan compression
docker-compose exec postgres pg_dump -U xairside xairside | gzip > backup.sql.gz
```

### Restore Database

```bash
docker-compose exec -T postgres psql -U xairside xairside < backup.sql
gunzip -c backup.sql.gz | docker-compose exec -T postgres psql -U xairside xairside
```

### Database Shell

```bash
docker-compose exec postgres psql -U xairside -d xairside
# Commands: \dt (list tables), \du (list users), \l (list databases), \q (quit)
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs web

# Check if ports in use
netstat -tuln | grep 3000
lsof -i :2026
kill -9 <PID>
```

### Database Connection Error

```bash
# Check postgres status
docker-compose ps postgres

# Test connection
docker-compose exec postgres pg_isready -U xairside

# Restart postgres
docker-compose restart postgres

# Check DATABASE_URL
docker-compose exec web echo $DATABASE_URL
```

### Permission Issues

```bash
sudo chown -R $(id -u):$(id -g) ./prisma ./public/uploads ./logs
sudo docker-compose up -d
```

### Port Conflicts

```bash
# Change port di docker-compose.yml
web:
  ports:
    - "2027:2026"

postgres:
  ports:
    - "5433:5432"
```

## Production Setup

**Before production:**
- [ ] Generate NEXTAUTH_SECRET: `openssl rand -base64 32`
- [ ] Change XAIRSIDE_SEED_PASSWORD
- [ ] Change POSTGRES_PASSWORD
- [ ] Set NODE_ENV=production
- [ ] Use production domain untuk NEXT_PUBLIC_API_URL
- [ ] Setup SSL/TLS dengan reverse proxy
- [ ] Configure database backups
- [ ] Setup monitoring

## Configuration Files

- `.env.docker` - Docker Compose environment variables
- `.env.local` - Local override (git ignored)
- `docker-compose.yml` - Service configuration
- `Dockerfile` - Application image build

---

**Last Updated:** 2026-09-17

