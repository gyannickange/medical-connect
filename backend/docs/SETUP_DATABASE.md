# Database Setup Guide

## Quick Setup

### 1. Create Environment File

Copy the environment template and configure your database:

```bash
cd server-nest
cp env.template .env
```

### 2. Update Database Configuration

Open `.env` and update the `DATABASE_URL` with your PostgreSQL connection string:

```env
# Option 1: Local PostgreSQL
DATABASE_URL=postgresql://username:password@localhost:5432/stockflow

# Option 2: Neon Database (Serverless PostgreSQL)
DATABASE_URL=postgresql://username:password@hostname.neon.tech/stockflow?sslmode=require

# Option 3: Other PostgreSQL providers
DATABASE_URL=postgresql://username:password@hostname:port/database_name
```

### 3. Using Neon Database (Recommended)

[Neon](https://neon.tech) provides free serverless PostgreSQL databases:

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Paste it into your `.env` file as `DATABASE_URL`

### 4. Using Local PostgreSQL

If you want to use a local PostgreSQL database:

```bash
# Install PostgreSQL (macOS)
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb stockflow

# Update .env
DATABASE_URL=postgresql://yourusername@localhost:5432/stockflow
```

### 5. Initialize Database Schema

Once your database is configured, the application will automatically:

- Create all required tables
- Set up default tenant
- Create sample data (categories)

### 6. Environment Variables

Complete `.env` configuration:

```env
# Database Configuration
DATABASE_URL=your_database_connection_string_here

# Server Configuration
PORT=5000
NODE_ENV=development

# Security
SESSION_SECRET=change-this-to-a-secure-random-string

# Admin Configuration (optional - for default admin user creation)
ADMIN_PASSWORD=your_secure_password_here
```

## Troubleshooting

### Database Connection Issues

If you see `ECONNREFUSED` errors:

- Check that your database is running
- Verify the DATABASE_URL is correct
- Ensure your database accepts connections from your IP

### Missing Tables

If tables are missing:

- Check the console logs for initialization errors
- Verify your database user has CREATE TABLE permissions
- Run the initialization manually if needed

### Default Data Not Created

The app will automatically create default data on first run. Check logs for:

```
[StorageService] Default data initialized successfully
```

## Next Steps

After setting up the database:

1. Start the development server:

   ```bash
   npm run dev
   ```

2. The server will be available at:
   - API: `http://localhost:5000/api`
   - WebSocket: `ws://localhost:5000/api/ws/signaling`
   - Frontend: `http://localhost:5000`

## Database Schema

The application uses Drizzle ORM with PostgreSQL. Schema is defined in:

- `src/shared/schema.ts` - All table definitions
- `src/lib/database-storage.ts` - Database operations

For more information, see the [NestJS Architecture Guide](./docs/NESTJS_ARCHITECTURE.md).
