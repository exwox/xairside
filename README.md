# X-Airside - Airport Facility Monitoring System

> **X-Airside** is a comprehensive airport facility monitoring web application built with Next.js, Prisma, and PostgreSQL. It enables airports to monitor runway, taxiway, apron, markings, and PCI (Pavement Condition Index) conditions with role-based access control.

![Next.js](https://img.shields.io/badge/Next.js-16.3.3-black?style=flat&logo=next.js)
![Prisma](https://img.shields.io/badge/Prisma-5.22.0-blue?style=flat&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-alpine-blue?style=flat&logo=postgresql)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)
![Docker](https://img.shields.io/badge/Docker-24-slim-blue?style=flat&logo=docker)

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [User Roles & Permissions](#user-roles--permissions)
- [Page Access Matrix](#page-access-matrix)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Prisma Schema](#prisma-schema)
- [Seed Data](#seed-data)
- [Configuration](#configuration)
- [Docker Configuration](#docker-configuration)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)
- [Contributing](#contributing)
- [License](#license)

---

## ✨ Features

- **Role-Based Access Control (RBAC)**: Four-tier user roles (SUPADMIN, ADMIN, USER, VIEWER) with granular page-level permissions
- **Multi-Airport Support**: Supadmin can manage multiple airports; users/VIEWER scoped to single airport
- **Dashboard**: Real-time overview of facility conditions, KPIs, and statistics
- **Inspection Management**: Create, approve, and track facility inspections
- **Damage Tracking**: Log and monitor runway/taxiway/apron damage findings
- **Markings Management**: Maintain pavement marking records
- **PCI Monitoring**: Dashboard and data for Pavement Condition Index surveys
- **CV Curves**: DV and CDV flexible/rigid curve analysis tools
- **Facility Management**: CRUD operations for airport facilities
- **User Management**: Admin panel for managing users and roles
- **Airport Management**: Configure airports with coordinates and timezone
- **Backup & Recovery**: Automated backup logs and data restoration
- **Session-Based Auth**: Secure cookie-based sessions with 7-day expiry
- **Responsive UI**: Modern, clean interface with Lucide icons

---

## 🛠 Tech Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | Next.js 16.3.3 (App Router) |
| **Language** | TypeScript |
| **ORM** | Prisma 5.22.0 |
| **Database** | PostgreSQL 16 (Alpine) |
| **Styling** | Tailwind CSS |
| **Icons** | Lucide React |
| **Auth** | Custom session-based cookies |
| **Build Tool** | Turbopack |
| **Containerization** | Docker + Docker Compose |
| **Node Version** | 24 (LTS) |

---

## 🏗 Architecture

```
Client Browser -> Next.js App Router -> Auth & Access Control -> Prisma ORM -> PostgreSQL
```

**Layers:**
1. **Presentation**: Next.js App Router pages and API routes
2. **Auth**: `src/lib/auth.ts` handles sessions, cookies, and access control
3. **Data**: Prisma ORM with PostgreSQL database
4. **Container**: Docker Compose orchestrates web app + PostgreSQL

---

## 📁 Project Structure

```
xairside/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── page.tsx                  # Home/Dashboard page
│   │   ├── login/
│   │   │   └── page.tsx              # Login page (client component)
│   │   ├── inspeksi/page.tsx         # Inspection pages
│   │   ├── kerusakan/page.tsx        # Damage pages
│   │   ├── marka/page.tsx            # Markings pages
│   │   ├── pci/page.tsx              # PCI pages
│   │   ├── admin/page.tsx            # Admin panel
│   │   └── api/                      # API routes
│   │       ├── auth/
│   │       │   ├── login/route.ts    # POST /api/auth/login
│   │       │   ├── logout/route.ts   # POST /api/auth/logout
│   │       │   ├── me/route.ts       # GET /api/auth/me
│   │       │   └── select-airport/route.ts
│   │       ├── users/                # User management API
│   │       ├── airports/             # Airport management API
│   │       ├── damages/              # Damage CRUD API
│   │       └── ...
│   ├── lib/
│   │   ├── auth.ts                   # Auth logic, sessions, cookies
│   │   ├── db.ts                     # Prisma client singleton
│   │   ├── page-access.ts            # Page definitions & role checks
│   │   └── page-access-server.ts     # Server-side access control
│   ├── components/
│   │   ├── AppShell.tsx              # Main layout with nav/header
│   │   ├── PageAccessGate.tsx        # Auth guard component
│   │   ├── DashboardView.tsx         # Dashboard content
│   │   └── ...                      # Feature components
│   └── prisma/
│       ├── schema.prisma             # Prisma schema
│       └── seed.ts                   # Seed script
├── prisma/
│   ├── dev.db                        # Dev SQLite database
│   └── schema.prisma                 # Dev schema copy
├── Dockerfile                        # Production container
├── docker-compose.yml                # Docker Compose orchestration
├── .env                              # Environment variables
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript config
├── next.config.ts                    # Next.js config
└── README.md                         # This file
```

---

## 🚀 Quick Start

### Prerequisites

- **Docker** 24.x+ and **Docker Compose** V2
- **Node.js** 24.x (for local development)
- **PostgreSQL** 16+ (for local development)
- **Git**

### Docker Deployment (Recommended)

```bash
# Clone and start
git clone https://github.com/your-org/xairside.git
cd xairside

# Configure
cp .env.example .env
nano .env

# Build and start
docker compose up -d

# Watch logs until ready
docker compose logs -f

# Access application: http://localhost:2026

# Stop
docker compose down
```

### Local Development

```bash
# Install dependencies
npm install
npx prisma generate

# Setup PostgreSQL and create database
createdb xairside

# Run database migration & seed
npx prisma db push
npx tsx prisma/seed.ts

# Start dev server
npm run dev

# Open browser: http://localhost:3000
```

---

## 👥 User Roles & Permissions

| Role | Description | Access Level |
|------|-------------|-------------|
| **SUPADMIN** | Super Administrator | Full system access, all airports |
| **ADMIN** | Administrator | Work pages + admin panel, single airport |
| **USER** | Regular User | Work pages only, single airport |
| **VIEWER** | Viewer | Dashboard only, single airport |

### Default Seed Users

| Email | Role | Password |
|-------|------|----------|
| `supadmin@airside.com` | SUPADMIN | `XairsideAdmin123!` |
| `admin.rhf@airside.com` | ADMIN | `XairsideAdmin123!` |
| `user.rhf@airside.com` | USER | `XairsideAdmin123!` |
| `viewer.rhf@airside.com` | VIEWER | `XairsideAdmin123!` |
| `admin.yia@airside.com` | ADMIN | `XairsideAdmin123!` |

---

## 📊 Page Access Matrix

| Page | SUPADMIN | ADMIN | USER | VIEWER |
|------|:--------:|:-----:|:----:|:------:|
| Dashboard (`/`) | ✅ | ✅ | ✅ | ✅ |
| Inspeksi (`/inspeksi`) | ✅ | ✅ | ✅ | ❌ |
| Kerusakan (`/kerusakan`) | ✅ | ✅ | ✅ | ❌ |
| Marka (`/marka`) | ✅ | ✅ | ✅ | ❌ |
| PCI (`/pci`) | ✅ | ✅ | ✅ | ❌ |
| Admin Panel (`/admin`) | ✅ | ✅ | ❌ | ❌ |
| Users (`/admin/users`) | ✅ | ✅ | ❌ | ❌ |
| Airports (`/admin/airports`) | ✅ | ✅ | ❌ | ❌ |
| DV/CDV Curves (`/admin/kurva-*`) | ✅ | ✅ | ❌ | ❌ |

---

## 🔌 API Endpoints

### Authentication

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| `POST` | `/api/auth/login` | Login with email/password | `{email, password}` |
| `POST` | `/api/auth/logout` | Logout and destroy session | - |
| `GET` | `/api/auth/me` | Get current user session | - |
| `POST` | `/api/auth/select-airport` | Select active airport | `{airportId}` |

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users |
| `POST` | `/api/users` | Create user |
| `PUT` | `/api/users/[id]` | Update user |
| `DELETE` | `/api/users/[id]` | Delete user |

### Airport Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/airports` | List airports |
| `POST` | `/api/airports` | Create airport |
| `PUT` | `/api/airports/[id]` | Update airport |

### Inspection Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inspections` | List inspections |
| `POST` | `/api/inspections` | Create inspection |
| `POST` | `/api/inspections/[id]/approve` | Approve inspection |
| `POST` | `/api/inspections/[id]/export` | Export inspection |

### Damage Tracking

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/damages` | List damages |
| `POST` | `/api/damages` | Create damage |
| `PUT` | `/api/damages/[id]` | Update damage |

### PCI Modules

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/pci/catalog` | PCI catalog |
| `GET` | `/api/pci/dv-curves` | DV curves |
| `GET` | `/api/pci/cdv-curves` | CDV curves |
| `GET` | `/api/pci/sections` | PCI sections |
| `GET` | `/api/pci/sections/[id]/surveys` | Surveys |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | System configuration |
| `GET` | `/api/backup` | Backup logs |
| `GET` | `/api/backup/history` | Backup history |
| `POST` | `/api/upload` | Upload files |

---

## 🔐 Authentication

### How It Works

1. User submits email/password via login form
2. Server verifies credentials against PostgreSQL
3. Session token created and stored in `Session` table
4. Session cookie (`xairside_session`) set in browser (7-day expiry, HttpOnly)
5. Active airport cookie (`xairside_active_airport`) set for airport-scoped users
6. Subsequent requests validate session via cookie
7. `PageAccessGate` checks authentication and permissions before rendering

### Session Flow

```
User Login -> Verify Credentials -> Create Session -> Set Cookies -> Redirect to Dashboard
                                              |
                                     /api/auth/me called on every page load
                                              |
                                     Validate Session -> Return User Context
                                              |
                                     Check Page Access -> Render or Deny
```

### Cookie Configuration

| Cookie | Purpose | HttpOnly | Max-Age |
|--------|---------|----------|---------|
| `xairside_session` | Session token | Yes | 604800s (7 days) |
| `xairside_active_airport` | Active airport ID | No | 604800s (7 days) |

> **Note**: Cookies use `Secure` flag when `NEXTAUTH_URL` starts with `https://`. For HTTP, Secure flag is disabled automatically.

---

## 🗄 Prisma Schema

### Core Models

```prisma
model Airport {
  id        String   @id @default(uuid())
  code      String   @unique
  name      String
  timezone  String   @default("Asia/Jakarta")
  isActive  Boolean  @default(true)
  refLat    Float    @default(0.9569)
  refLng    Float    @default(104.5311)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users       User[]
  facilities  Facility[]
  damages     Damage[]
  markings    MarkingFinding[]
  mapLayers   MapLayer[]
  pciSections PciSection[]
  pciSurveys  PciSurvey[]
  inspections Inspection[]
  configs     AirportConfig[]
  backupLogs  BackupLog[]
}

model User {
  id           String       @id @default(uuid())
  name         String
  email        String       @unique
  passwordHash String
  role         String       // "SUPADMIN", "ADMIN", "USER", "VIEWER"
  airportId    String?
  airport      Airport?     @relation(fields: [airportId], references:[id], onDelete: SetNull)
  isActive     Boolean      @default(true)
  sessions     Session[]
  inspections  Inspection[] @relation("InspectorRelation")
  approvals    Inspection[] @relation("SupervisorRelation")
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
}

model Session {
  id        String   @id @default(uuid())
  tokenHash String
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}
```

For the full schema, see `prisma/schema.prisma`.

---

## 🌱 Seed Data

The seed script (`prisma/seed.ts`) creates default users and airports. All seeded users use password: `XairsideAdmin123!`

### Run Seed Manually

```bash
npx tsx prisma/seed.ts
```

---

## ⚙️ Configuration

### Environment Variables (`.env`)

```env
# Database
DATABASE_URL=postgresql://xairside:xairside123@localhost:5432/xairside

# Server
PORT=2026
NODE_ENV=production

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:2026

# Authentication
NEXTAUTH_URL=http://localhost:2026
NEXTAUTH_SECRET=your-production-secret-key-change-this

# Application
XAIRSIDE_SEED_PASSWORD=XairsideAdmin123!
```

> **Important**: Change `NEXTAUTH_SECRET` to a strong random string in production. Use `openssl rand -hex 32`.

---

## 🐳 Docker Configuration

### Dockerfile

```dockerfile
FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm install --legacy-peer-deps 2>&1 || npm install --legacy-peer-deps --force
RUN npm run build
EXPOSE 2026
ENV PORT=2026
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx prisma db seed && npm start"]
```

> **Note**: Uses `node:24-slim` (Debian) instead of Alpine. Prisma 5.22.0 engines require glibc and OpenSSL, incompatible with Alpine's musl libc.

### Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: xairside-db
    environment:
      POSTGRES_DB: xairside
      POSTGRES_USER: xairside
      POSTGRES_PASSWORD: xairside123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U xairside"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
  web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: xairside-app
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "2026:2026"
    environment:
      DATABASE_URL: postgresql://xairside:xairside123@postgres:5432/xairside
      PORT: 2026
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: http://localhost:2026
      NEXTAUTH_URL: http://localhost:2026
      NEXTAUTH_SECRET: your-production-secret-key-change-this
      XAIRSIDE_SEED_PASSWORD: XairsideAdmin123!
    volumes:
      - ./prisma:/app/prisma
      - ./public/uploads:/app/public/uploads
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:2026"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
volumes:
  postgres_data:
    driver: local
```

### Docker Commands

```bash
docker compose up -d                  # Start all services
docker compose logs -f               # View logs
docker compose down                  # Stop services
docker compose build --no-cache && docker compose up -d  # Rebuild after code changes
```

---

## 🔧 Troubleshooting

### Build Errors

**Error: `Turbopack build failed` - `'import', and 'export' cannot be used outside of module code`**
- **Cause**: Missing closing brace in `src/lib/auth.ts`
- **Fix**: Ensure `setSessionCookie` function has closing `}` before next `export` statement
- **Location**: Check `src/lib/auth.ts` lines 93-102

**Error: `libssl.so.1.1: No such file or directory`**
```
PrismaClientInitializationError: Unable to require libquery_engine-linux-musl.so.node
```
- **Cause**: Alpine Linux uses musl libc, incompatible with Prisma 5.22.0 prebuilt binaries
- **Fix**: Change `FROM node:24-alpine` to `FROM node:24-slim` in Dockerfile
- **Root Cause**: Alpine 3.17+ removed OpenSSL 1.1; Prisma engines require glibc and OpenSSL 3

### Runtime Issues

**Login redirects back to login page (infinite loop)**
- **Cause**: After login, `activeAirport` cookie not set, so `getSessionContext()` returns null
- **Fix**: Added `setActiveAirportCookie()` in login route; sets default airport for non-SUPADMIN, first active airport for SUPADMIN
- **Files**: `src/app/api/auth/login/route.ts`, `src/lib/auth.ts`

**Cookies not being set in browser (HTTP production server)**
- **Cause**: Cookie `Secure` flag set when `NODE_ENV=production`, but server uses HTTP not HTTPS
- **Fix**: Updated `src/lib/auth.ts` to check `NEXTAUTH_URL` starts with `https://` before setting `Secure` flag
- **Solution**: Set `NEXTAUTH_URL=http://your-server:2026` for HTTP deployments

**Build succeeds but container exits immediately**
- **Cause**: Prisma schema not synced with database
- **Fix**: Check `DATABASE_URL` in `.env` and `docker-compose.yml` match; run `npx prisma db push` manually

**Database connection refused**
- **Cause**: PostgreSQL not ready when app starts
- **Fix**: `depends_on` with `condition: service_healthy` ensures DB is ready; increase `start_period` if needed

---

## 🚢 Production Deployment

### Server Requirements

- Ubuntu/Debian 22.04+ or CentOS 7+
- Docker 24.x+ and Docker Compose V2
- 2GB+ RAM, 2CPU cores
- 10GB+ disk space
- Open firewall port 2026 (or reverse proxy port 80/443)

### Deployment Steps

```bash
# SSH into server
ssh user@your-server-ip

# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Clone project
git clone https://github.com/your-org/xairside.git
cd xairside

# Configure environment
cp .env.example .env
nano .env

# Important: Set NEXTAUTH_URL to match your domain
# For HTTPS: NEXTAUTH_URL=https://yourdomain.com
# For HTTP: NEXTAUTH_URL=http://your-server-ip:2026

# Generate strong secret
NEXTAUTH_SECRET=$(openssl rand -hex 32)

# Build and deploy
docker compose build --no-cache
docker compose up -d

# Verify
docker compose ps
docker compose logs -f
```

### With HTTPS (Recommended)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
# Then set: NEXTAUTH_URL=https://yourdomain.com
```

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    location / {
        proxy_pass http://localhost:2026;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Backup Strategy

```bash
# Backup database
docker compose exec postgres pg_dump -U xairside xairside > backup_$(date +%Y%m%d).sql

# Restore database
docker compose exec -T postgres psql -U xairside xairside < backup.sql
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License.

---

## 📞 Support

- **Documentation**: Check `src/lib/auth.ts`, `src/lib/page-access.ts`, and `prisma/schema.prisma` for implementation details
- **Issues**: Open an issue on GitHub
- **Email**: admin@airside.com

---

## 📈 Changelog

### v1.0.0 - Initial Release

- Next.js 16.3.3 with App Router
- Prisma 5.22.0 with PostgreSQL 16
- Role-based access control (4 roles)
- Session-based authentication
- Multi-airport support
- Docker containerization
- Fixed: Alpine to Debian slim base image for Prisma compatibility
- Fixed: Login redirect loop (active airport cookie)
- Fixed: Cookie Secure flag for HTTP deployments
- Fixed: Syntax error in auth.ts (missing closing brace)
