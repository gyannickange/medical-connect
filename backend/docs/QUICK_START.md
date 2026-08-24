# 🚀 Quick Start Guide

Get the StockFlow NestJS server running in **3 simple steps**.

## Prerequisites

- Node.js 18+
- PostgreSQL database (or Neon serverless)

## Step 1: Configure Environment

```bash
# Copy environment template
cp env.template .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
SESSION_SECRET=your-super-secret-key-here
ADMIN_PASSWORD=admin123
PORT=5000
NODE_ENV=development
```

## Step 2: Install Dependencies

```bash
npm install
```

> ⏱️ This will install 976 packages (~5 minutes)

## Step 3: Start Server

**Development mode:**

```bash
npm run dev
```

**Production mode:**

```bash
npm run build
npm run start
```

## ✅ Server Running!

Your server is now running at:

- **API**: http://localhost:5000/api/\*
- **WebSocket**: ws://localhost:5000/api/ws/signaling
- **PouchDB**: http://localhost:5000/api/pouchdb/\*

## 🧪 Test It

### Test API

```bash
curl http://localhost:5000/api/tenants
```

### Test WebSocket (JavaScript)

```javascript
const ws = new WebSocket("ws://localhost:5000/api/ws/signaling");
ws.onopen = () => {
  ws.send(
    JSON.stringify({
      type: "register",
      peerId: "test-123",
      tenantId: "default-tenant",
    })
  );
};
```

### Test PouchDB

```bash
curl -X PUT http://localhost:5000/api/pouchdb/default-tenant
```

## 📚 Available Scripts

```bash
npm run dev          # Development with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run linter
npm run test         # Run tests
```

## 🔍 Troubleshooting

### Port Already in Use

```bash
lsof -ti:5000 | xargs kill -9
```

### Database Connection Error

- Check `DATABASE_URL` in `.env`
- Verify PostgreSQL is running
- Test connection: `psql $DATABASE_URL`

### Missing Dependencies

```bash
rm -rf node_modules package-lock.json
npm install
```

## 📖 Need More Help?

- **Complete Setup**: See `STANDALONE_SETUP.md`
- **API Documentation**: See `README.md`
- **Architecture**: See `../NESTJS_ARCHITECTURE.md`

## 🎉 You're Ready!

Start building with:

- 13 feature modules
- 31 API endpoints
- WebSocket signaling
- PouchDB replication
- Full TypeScript support
- Enterprise security

Happy coding! 🚀
