# Docker Compose Quick Reference

## Start/Stop

```bash
# Start
docker-compose up -d

# Stop
docker-compose stop

# Restart
docker-compose restart

# Stop & remove
docker-compose down

# Remove volumes too (WARNING: deletes database!)
docker-compose down -v
```

## Status & Logs

```bash
# View running containers
docker-compose ps

# View logs (all)
docker-compose logs -f

# View logs (web service only)
docker-compose logs -f web

# View logs (postgres only)
docker-compose logs -f postgres

# View resource usage
docker stats
```

## Database

```bash
# Connect to database shell
docker-compose exec postgres psql -U xairside -d xairside

# Backup database
docker-compose exec postgres pg_dump -U xairside xairside > backup.sql

# Backup with compression
docker-compose exec postgres pg_dump -U xairside xairside | gzip > backup.sql.gz

# Restore database
docker-compose exec -T postgres psql -U xairside xairside < backup.sql

# Seed initial data
docker-compose exec web npx prisma db seed
```

## Application Management

```bash
# Execute command in web container
docker-compose exec web bash

# Run migrations
docker-compose exec web npx prisma migrate deploy

# Rebuild containers
docker-compose build

# Build & restart
docker-compose up -d --build

# View environment variables
docker-compose exec web env
```

## Troubleshooting

```bash
# Check if ports are available
netstat -tuln | grep -E ':(3000|5432)'

# Kill process on port
lsof -i :3000
kill -9 <PID>

# View detailed logs
docker-compose logs --tail=100

# Inspect service configuration
docker-compose config

# Validate compose file
docker-compose config --quiet
```

## Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Main configuration |
| `.env.docker` | Docker environment template |
| `.env.local` | Local environment overrides |
| `Dockerfile` | Application image |
| `DOCKER_COMPOSE.md` | Full documentation |
| `DEPLOYMENT_CHECKLIST.md` | Deployment guide |

## Service Details

| Service | Port | Username | Password |
|---------|------|----------|----------|
| Web App | 3000 | — | — |
| PostgreSQL | 5432 | xairside | xairside123 |

## Environment Variables

```bash
DATABASE_URL=postgresql://xairside:xairside123@postgres:5432/xairside
PORT=3000
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
XAIRSIDE_SEED_PASSWORD=XairsideAdmin123!
```

## Useful Commands

```bash
# Check all containers status
docker-compose ps

# View container IP addresses
docker-compose exec web hostname -I

# Clean up Docker system
docker system prune -a

# View network details
docker network ls
docker network inspect xairside_xairside-network

# Export logs
docker-compose logs > full-logs.txt
```

## Emergency

```bash
# Full reset (CAUTION - deletes database!)
docker-compose down -v
docker volume prune
docker-compose up -d

# Check disk usage
docker system df

# View all containers (including stopped)
docker ps -a

# Remove stopped containers
docker container prune
``` 

---

Keep this for quick reference during daily operations.
