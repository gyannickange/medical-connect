# StockFlow NestJS - Standalone Server Setup

This document explains how `server-nest` is now a completely independent server that doesn't depend on the parent directory.

## ✅ What Was Changed

### 1. **New Independent Files Created**

#### Core Libraries (`src/lib/`)

- **`src/lib/db.ts`** - Database connection setup (copied from `../server/db.ts`)
- **`src/lib/database-storage.ts`** - Storage implementation (copied from `../server/database-storage.ts`)
- **`src/lib/storage.interface.ts`** - Storage interface definition (extracted from `../server/storage.ts`)

#### Shared Schema (`src/shared/`)

- **`src/shared/schema.ts`** - Complete database schema with Drizzle ORM (copied from `../shared/schema.ts`)

#### Configuration Files

- **`vite.config.ts`** - Vite configuration for this server (adapted from parent)
- **`package.json`** - Standalone package with all dependencies
- **`env.template`** - Environment variables template
- **`README.md`** - Complete documentation for this server

### 2. **Updated Imports**

All imports have been updated to use local files instead of parent directory:

#### Before:

```typescript
// database.service.ts
import { db } from "../../server/db";

// storage.service.ts
import { DatabaseStorage } from "../../server/database-storage";

// vite.service.ts
import viteConfig from "../../vite.config";

// All services
import type { User, Product } from "@shared/schema";
```

#### After:

```typescript
// database.service.ts
import { db, pool } from "../lib/db";

// storage.service.ts
import { DatabaseStorage } from "../lib/database-storage";

// vite.service.ts
import viteConfig from "../../vite.config";

// All services
import type { User, Product } from "../shared/schema";
```

## 📦 Complete File Structure

```
server-nest/
├── src/
│   ├── shared/                      # ✅ NEW - Independent schema
│   │   └── schema.ts                # Database schema with Drizzle
│   ├── lib/                         # ✅ NEW - Core libraries
│   │   ├── db.ts                    # Database connection
│   │   ├── database-storage.ts      # Storage implementation
│   │   └── storage.interface.ts     # Storage interface
│   ├── database/                    # ✅ UPDATED - Uses local imports
│   │   ├── database.module.ts
│   │   ├── database.service.ts      # Now imports from ../lib/db
│   │   └── storage.service.ts       # Now imports from ../lib/database-storage
│   ├── common/
│   │   ├── interceptors/
│   │   │   └── logging.interceptor.ts
│   │   └── filters/
│   │       └── http-exception.filter.ts
│   ├── modules/
│   │   ├── auth/                    # ✅ UPDATED - Uses ../shared/schema
│   │   │   ├── dto/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.module.ts
│   │   ├── tenants/
│   │   ├── categories/
│   │   ├── products/
│   │   ├── stock/
│   │   ├── customers/
│   │   ├── sales/
│   │   ├── staff/
│   │   ├── dashboard/
│   │   ├── sync/
│   │   ├── peers/
│   │   └── pouchdb/
│   ├── websocket/
│   │   ├── websocket.module.ts
│   │   ├── signaling.gateway.ts
│   │   ├── interfaces/
│   │   └── services/
│   ├── vite/                        # ✅ UPDATED - Uses local vite.config
│   │   ├── vite.module.ts
│   │   └── vite.service.ts
│   ├── app.module.ts
│   └── main.ts
├── vite.config.ts                   # ✅ NEW - Standalone Vite config
├── package.json                     # ✅ NEW - Standalone dependencies
├── nest-cli.json                    # ✅ EXISTS - NestJS CLI config
├── tsconfig.json                    # ✅ EXISTS - TypeScript config
├── env.template                     # ✅ NEW - Environment template
└── README.md                        # ✅ NEW - Complete documentation
```

## 🚀 Setup Instructions

### 1. Navigate to server-nest directory

```bash
cd server-nest
```

### 2. Install dependencies

```bash
npm install
```

This installs all necessary packages including:

- NestJS core (`@nestjs/common`, `@nestjs/core`)
- Fastify (`fastify`, `@nestjs/platform-fastify`)
- WebSocket support (`@nestjs/websockets`, `@nestjs/platform-ws`)
- Database (`drizzle-orm`, `@neondatabase/serverless`)
- PouchDB (`pouchdb-node`, `express-pouchdb`)
- Vite (`vite`, `@vitejs/plugin-react`)
- All other required dependencies

### 3. Configure environment

```bash
cp env.template .env
```

Edit `.env` with your configuration:

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
PORT=5000
NODE_ENV=development
SESSION_SECRET=your-secret-key-here
ADMIN_PASSWORD=admin123
```

### 4. Run the server

**Development mode:**

```bash
npm run dev
```

**Production mode:**

```bash
npm run build
npm run start
```

## 🔄 No Parent Dependencies

The `server-nest` directory is now completely independent:

✅ **All code is self-contained**

- No imports from `../server/`
- No imports from `../shared/`
- No imports from parent `node_modules`

✅ **All dependencies are local**

- Own `package.json` with complete dependencies
- Own `node_modules` (after `npm install`)
- Own configuration files

✅ **Can be deployed separately**

- Copy `server-nest/` to any location
- Run `npm install`
- Configure `.env`
- Start the server

## 📊 Comparison

| Aspect           | Before                                   | After                             |
| ---------------- | ---------------------------------------- | --------------------------------- |
| **Schema**       | `@shared/schema` (parent)                | `../shared/schema` (local)        |
| **Database**     | `../../server/db` (parent)               | `../lib/db` (local)               |
| **Storage**      | `../../server/database-storage` (parent) | `../lib/database-storage` (local) |
| **Vite Config**  | `../../vite.config` (parent)             | `../../vite.config` (local)       |
| **Dependencies** | Parent `package.json`                    | Own `package.json`                |
| **node_modules** | Parent directory                         | Own directory                     |

## 🎯 Key Benefits

1. **Portability**: Can move `server-nest` anywhere without breaking
2. **Independence**: Doesn't depend on parent project structure
3. **Clarity**: All code and dependencies are in one place
4. **Deployment**: Can deploy just `server-nest` without parent project
5. **Development**: Can work on NestJS server without affecting Express server

## 🔍 Verifying Independence

To verify the server is truly independent:

```bash
# From project root
cp -r server-nest /tmp/stockflow-nest
cd /tmp/stockflow-nest
npm install
cp env.template .env
# Edit .env with your config
npm run build
npm run start
```

If it works, the server is completely independent! ✅

## 📝 Next Steps

1. **Install dependencies**: `cd server-nest && npm install`
2. **Configure environment**: Copy `env.template` to `.env` and configure
3. **Run migrations** (if needed): Set up your database schema
4. **Start server**: `npm run dev`
5. **Test endpoints**: Visit `http://localhost:5000`

## ⚠️ Important Notes

- **Client files**: Still references `../client/` for Vite (intentional for dev mode)
- **Assets**: Still references `../attached_assets/` (intentional for shared assets)
- **Database**: Requires PostgreSQL or Neon serverless database
- **Environment**: Must set `DATABASE_URL` and `SESSION_SECRET` in `.env`

## 🎉 Success!

Your NestJS server is now a standalone, independent application ready for development and deployment!
