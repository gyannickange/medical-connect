# Drizzle-Kit Migration Management

This project now uses `drizzle-kit` for managing database migrations. This guide covers all the commands and workflows you need.

## 📋 Available Commands

### Generate Migrations

```bash
npm run db:generate
```

Generates SQL migration files based on changes in your schema (`src/shared/schema.ts`). This compares your current schema with the last migration state and creates a new migration file.

### Apply Migrations

```bash
npm run db:migrate
```

Applies all pending migrations to your database. This reads the generated SQL files and executes them.

### Push Schema (Development Only)

```bash
npm run db:push
```

**⚠️ WARNING:** Pushes your schema directly to the database without generating migration files. Use only in development! This is great for rapid prototyping but skips migration history.

### Drizzle Studio (Database GUI)

```bash
npm run db:studio
```

Opens Drizzle Studio - a visual database browser at `https://local.drizzle.studio`. Great for exploring and modifying data during development.

### Drop Migration

```bash
npm run db:drop
```

Drops a migration from the migrations folder. Use this if you need to remove an unwanted migration file.

## 🔄 Standard Workflow

### 1. **Making Schema Changes**

Edit your schema in `src/shared/schema.ts`. For example:

```typescript
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  // Add new field:
  phoneNumber: text("phone_number"),
});
```

### 2. **Generate Migration**

```bash
npm run db:generate
```

This creates a new migration file in `drizzle/` with a unique name like `0001_fancy_hulk.sql`.

### 3. **Review the Migration**

Always review the generated SQL before applying:

```bash
cat drizzle/0001_fancy_hulk.sql
```

### 4. **Apply Migration**

```bash
npm run db:migrate
```

Or use the programmatic runner:

```bash
npm run migrate:drizzle
```

## 📝 Configuration

The configuration is in `drizzle.config.ts`:

```typescript
export default defineConfig({
  schema: "./src/shared/schema.ts", // Your schema file
  out: "./drizzle", // Migration output folder
  dialect: "postgresql", // Database dialect
  dbCredentials: {
    url: process.env.DATABASE_URL, // Connection string
  },
});
```

## 🎯 Best Practices

### ✅ DO:

- **Always generate migrations** when you change the schema
- **Review generated migrations** before applying them
- **Version control migrations** (commit them to git)
- **Run migrations in order** (drizzle-kit handles this automatically)
- **Use descriptive names** in your schema changes
- **Test migrations** on a development database first

### ❌ DON'T:

- **Don't edit generated migration files** unless absolutely necessary
- **Don't use `db:push` in production** - it skips migration history
- **Don't delete old migrations** once they're applied
- **Don't run migrations manually** - use the npm scripts
- **Don't commit `.env` files** with database credentials

## 🔧 Programmatic Migration

For programmatic migration running (e.g., in deployment scripts), use:

```bash
npm run migrate:drizzle
```

This uses the `scripts/migrate-drizzle.ts` script which:

- Loads environment variables
- Connects to the database
- Runs pending migrations
- Handles errors gracefully

## 🐛 Troubleshooting

### Migration Failed

If a migration fails:

1. Check the error message
2. Review the failed migration SQL
3. Fix the issue in your schema
4. Generate a new migration (don't edit the old one)
5. Apply the new migration

### Schema Drift

If your database schema doesn't match your migrations:

1. In development: `npm run db:push` to sync
2. In production: Create a migration to fix the drift

### Reset Database (Development Only)

```bash
# Drop all tables and reapply migrations
dropdb your_database_name
createdb your_database_name
npm run db:migrate
```

## 📚 Additional Resources

- [Drizzle Kit Documentation](https://orm.drizzle.team/kit-docs/overview)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Migration Guide](https://orm.drizzle.team/docs/migrations)

## 🔄 Migrating from Old System

Your old migrations in the `migrations/` folder can be kept for reference. The new drizzle-kit system:

- Stores migrations in `drizzle/`
- Tracks applied migrations in `drizzle.__drizzle_migrations` table
- Generates migrations automatically from schema changes

If you want to start fresh:

1. Ensure all old migrations are applied
2. Generate a baseline migration: `npm run db:generate`
3. Future changes use drizzle-kit workflow
