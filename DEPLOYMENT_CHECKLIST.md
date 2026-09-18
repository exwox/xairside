# Docker Compose Deployment Checklist

## Pre-Deployment

### Environment Setup
- [ ] Copy `.env.docker` ke `.env.local`
- [ ] Generate NEXTAUTH_SECRET: `openssl rand -base64 32`
- [ ] Update NEXTAUTH_SECRET di `.env.local`
- [ ] Update XAIRSIDE_SEED_PASSWORD ke password yang kuat (min 12 chars)
- [ ] Update POSTGRES_PASSWORD ke password yang kuat
- [ ] Verifikasi NEXT_PUBLIC_API_URL sesuai domain/localhost

### System Requirements
- [ ] Docker installed: `docker --version`
- [ ] Docker Compose installed: `docker-compose --version`
- [ ] Minimal 2GB RAM available
- [ ] Port 2026 available (atau update di docker-compose.yml)
- [ ] Port 5432 available (atau update di docker-compose.yml)

### Repository
- [ ] Clone/navigate ke project directory
- [ ] Ensure `.gitignore` includes `.env*` files
- [ ] Ensure `prisma/` directory exists
- [ ] Ensure `public/uploads/` directory exists

## Deployment

### Build & Start

```bash
# 1. Navigate to project
cd /path/to/xairside

# 2. Setup environment
cp .env.docker .env.local
# Edit .env.local dengan nilai production

# 3. Build images (if not using pre-built)
docker-compose build

# 4. Start containers
docker-compose up -d

# 5. Verify status
docker-compose ps

# 6. Check logs
docker-compose logs -f web
```

- [ ] Both containers show "Up" status
- [ ] No error messages in logs
- [ ] Application responds to http://localhost:2026

### Database Initialization

```bash
# Check if migrations are needed
docker-compose logs postgres

# If new database, run seed
docker-compose exec web npx prisma db seed
```

- [ ] Database migrations completed successfully
- [ ] Initial admin user created
- [ ] No connection errors

## Post-Deployment

### Verification

```bash
# Test application
curl http://localhost:2026

# Test database connection
docker-compose exec postgres pg_isready -U xairside

# Check healthchecks
docker-compose ps
# Both services should show "healthy" or "Up"
```

- [ ] Application accessible at http://localhost:2026
- [ ] Login page loads correctly
- [ ] Database is responding
- [ ] No errors in docker-compose logs

### Backup Initial State

```bash
# Backup initial database
docker-compose exec postgres pg_dump -U xairside xairside > backup-initial.sql.gz

# Save environment configuration
cp .env.local .env.local.backup
```

- [ ] Backup file created
- [ ] Backup size is reasonable (>1KB)

## Monitoring

### Daily Checks

```bash
# Check container status
docker-compose ps

# Check resource usage
docker stats

# Check logs for errors
docker-compose logs --since 1h | grep -i error
```

- [ ] Both containers running
- [ ] CPU/Memory usage normal
- [ ] No critical errors in logs

### Weekly Tasks

```bash
# Backup database
docker-compose exec postgres pg_dump -U xairside xairside | gzip > backup-$(date +%Y%m%d).sql.gz

# Check disk space
docker system df

# Prune unused resources
docker system prune
```

- [ ] Database backed up
- [ ] Disk space available
- [ ] No unused resources taking space

## Troubleshooting

### If containers won't start

```bash
docker-compose logs
# Check error messages

# Verify ports available
netstat -tuln | grep -E ':(3000|5432)'

# Restart services
docker-compose restart

# Full reset (WARNING: deletes database!)
docker-compose down -v
docker-compose up -d
```

### If database connection fails

```bash
# Check postgres is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U xairside -d xairside -c "SELECT 1"

# Check DATABASE_URL
docker-compose exec web echo $DATABASE_URL
```

### If application not responding

```bash
# Check web service logs
docker-compose logs web

# Test healthcheck
docker-compose exec web curl -f http://localhost:2026

# Restart web service
docker-compose restart web
```

## Maintenance

### Update Environment Variables

```bash
# Edit .env.local
nano .env.local

# Restart services to apply changes
docker-compose restart web
```

### Upgrade Database

```bash
# Backup first
docker-compose exec postgres pg_dump -U xairside xairside > backup-before-upgrade.sql

# Update docker-compose.yml postgres image version
# Restart
docker-compose restart postgres
```

### Update Application

```bash
# Pull latest code
git pull

# Rebuild image
docker-compose build --no-cache

# Restart with new image
docker-compose up -d
```

## Rollback Procedures

### Database Rollback

```bash
# If you have a backup
gunzip -c backup-before-upgrade.sql.gz | docker-compose exec -T postgres psql -U xairside xairside
```

### Application Rollback

```bash
# Revert to previous code
git checkout <previous-commit>

# Rebuild and restart
docker-compose build --no-cache
docker-compose restart web
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Port 2026 in use | Change port in docker-compose.yml or `lsof -i :2026 && kill -9 <PID>` |
| Connection refused | Check if postgres is healthy: `docker-compose ps postgres` |
| Permission denied on volumes | `sudo chown -R $(id -u):$(id -g) ./prisma ./public/uploads` |
| Seed password error | Update XAIRSIDE_SEED_PASSWORD to 12+ characters in .env.local |
| Out of disk space | `docker system prune -a` to remove unused images |
| Slow performance | Check resource usage: `docker stats` |

## Emergency Procedures

### Full Database Wipe (CAUTION!)

```bash
docker-compose down -v
docker-compose up -d
docker-compose exec web npx prisma db seed
```

### Container Logs for Debugging

```bash
# Get full logs
docker-compose logs --tail=1000 > debug.log

# Specific service
docker-compose logs web > web.log
docker-compose logs postgres > postgres.log
```

### Manual Database Connection

```bash
docker-compose exec postgres psql -U xairside -d xairside

# Then in psql shell:
\dt                    # List tables
SELECT * FROM User;    # Check users
\q                     # Quit
```

---

**Last Updated:** 2026-09-17
**Checklist Version:** 1.0
