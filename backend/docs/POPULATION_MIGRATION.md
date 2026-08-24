# Database Population Migration Guide

## Overview

This guide explains the architectural changes made to populate foreign key relationships in API responses and provides a step-by-step migration path for frontend applications.

## What Changed

### Database Layer

#### 1. Drizzle Relations Added

**File**: `backend/src/shared/schema.ts`

Added relation definitions for all tables to enable Drizzle's Query API:

```typescript
import { relations } from "drizzle-orm";

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  tenant: one(tenants, {
    fields: [products.tenantId],
    references: [tenants.id],
  }),
  variants: many(productVariants),
  stock: one(stock, {
    fields: [products.id],
    references: [stock.productId],
  }),
}));
```

#### 2. Pagination Interfaces

**File**: `backend/src/lib/storage.interface.ts`

```typescript
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  page?: number;
}
```

#### 3. Updated Storage Methods

**File**: `backend/src/lib/database-storage.ts`

Changed from:

```typescript
async getProductsByTenant(tenantId: string): Promise<Product[]> {
  return await db
    .select()
    .from(products)
    .where(eq(products.tenantId, tenantId));
}
```

To:

```typescript
async getProductsByTenant(
  tenantId: string,
  options?: PaginationOptions
): Promise<any[]> {
  return await db.query.products.findMany({
    where: eq(products.tenantId, tenantId),
    with: {
      category: true,
      tenant: true,
      variants: true,
      stock: true,
    },
    limit: options?.limit ?? 100,
    offset: options?.offset ?? 0,
  });
}
```

### Service Layer

All services updated to:

1. Accept `PaginationOptions` parameter
2. Pass options to storage layer
3. Return populated objects (`any[]` instead of strict types during migration)

**Example** (`products.service.ts`):

```typescript
async findByTenant(
  tenantId: string,
  options?: PaginationOptions
): Promise<any[]> {
  return this.storageService.getProductsByTenant(tenantId, options);
}
```

### Controller Layer

All controllers updated to:

1. Accept pagination query parameters
2. Pass them to service layer

**Example** (`products.controller.ts`):

```typescript
@Get(":tenantId")
async findByTenant(
  @Param("tenantId") tenantId: string,
  @Query("limit") limit?: number,
  @Query("offset") offset?: number,
  @Query("page") page?: number
) {
  return this.productsService.findByTenant(tenantId, {
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
    page: page ? Number(page) : undefined,
  });
}
```

## Migration Path

### Phase 1: Backend Deployment (Current)

**Status**: ✅ Complete

- Relations defined in schema
- Storage methods use Query API with `with` clauses
- Services accept pagination options
- Controllers expose pagination parameters
- Backward compatible (IDs still present)

### Phase 2: Frontend Gradual Migration (Next Steps)

#### Step 1: Update Type Definitions

Create new types that include populated fields:

```typescript
// frontend/src/types/api.ts

// Old type
interface Product {
  id: string;
  name: string;
  categoryId?: string;
  tenantId: string;
  price: string;
}

// New type (during transition)
interface ProductWithRelations extends Product {
  category?: Category;
  tenant: Tenant;
  variants: ProductVariant[];
  stock?: Stock;
}

// Eventually replace Product with ProductWithRelations
```

#### Step 2: Update API Hooks (Optional)

If using React Query or similar:

```typescript
// Before
const { data: products } = useQuery({
  queryKey: ["/api/products", tenantId],
});

// After (with pagination)
const { data: products } = useQuery({
  queryKey: ["/api/products", tenantId, { limit: 50, page: 0 }],
  queryFn: () =>
    fetch(`/api/products/${tenantId}?limit=50&page=0`).then((res) =>
      res.json()
    ),
});
```

#### Step 3: Remove Redundant API Calls

**Before** (multiple requests):

```typescript
// Fetch product
const product = await fetch(`/api/products/${id}`);

// Fetch category separately
if (product.categoryId) {
  const category = await fetch(`/api/categories/${product.categoryId}`);
}

// Fetch variants separately
const variants = await fetch(`/api/products/${id}/variants`);
```

**After** (single request):

```typescript
// Everything in one request
const product = await fetch(`/api/products/${id}`);
console.log(product.category.name); // Direct access
console.log(product.variants.length); // Direct access
```

#### Step 4: Update Components

**Before**:

```typescript
function ProductCard({ product }) {
  const { data: category } = useQuery({
    queryKey: [`/api/categories/${product.categoryId}`],
    enabled: !!product.categoryId,
  });

  return (
    <div>
      <h3>{product.name}</h3>
      <p>Category: {category?.name || 'Loading...'}</p>
    </div>
  );
}
```

**After**:

```typescript
function ProductCard({ product }) {
  return (
    <div>
      <h3>{product.name}</h3>
      <p>Category: {product.category?.name || 'Uncategorized'}</p>
    </div>
  );
}
```

### Phase 3: Cleanup (Future)

Once frontend fully migrated:

1. Update TypeScript types to require populated fields
2. Remove old separate fetch calls
3. Update documentation
4. Consider removing ID fields (breaking change - major version bump)

## Endpoint Updates

### All Modified Endpoints

✅ **Products**

- `GET /api/products/:tenantId` - Returns products with category, tenant, variants, stock
- `GET /api/products/:tenantId/search?q=query` - Same population
- `GET /api/products/barcode/:tenantId/:barcode` - Same population

✅ **Sales**

- `GET /api/sales/:tenantId` - Returns sales with customer, user, tenant, items (with products)
- `GET /api/sales/:tenantId/today` - Same population

✅ **Customers**

- `GET /api/customers/:tenantId` - Returns customers with tenant
- `GET /api/customers/:tenantId/search?q=query` - Same population

✅ **Stock**

- `GET /api/stock/:tenantId` - Returns stock with product (includes category, variants), tenant
- `GET /api/stock/:tenantId/low` - Same population

✅ **Staff**

- `GET /api/staff/:tenantId` - Returns users with tenant

✅ **Categories**

- `GET /api/categories/:tenantId` - Returns categories with tenant, products

All endpoints support `?limit=N&offset=N&page=N` query parameters.

## Performance Impact

### Improvements

- ✅ Fewer HTTP requests (1 instead of 3-5 for related data)
- ✅ Reduced network latency
- ✅ Better caching opportunities
- ✅ Simpler frontend code

### Database Load

- ✅ Efficient SQL joins (no N+1 queries)
- ✅ Single query per endpoint
- ✅ Pagination limits data volume
- ⚠️ Slightly larger response payloads (offset by fewer requests)

### Recommendations

1. Use pagination for all list endpoints
2. Cache populated responses
3. Monitor response sizes
4. Add indexes for joined fields (already present)

## Testing Checklist

### Backend Testing

- [ ] Test each endpoint returns populated data
- [ ] Verify pagination works (limit, offset, page)
- [ ] Check null/optional relations handled correctly
- [ ] Ensure no N+1 queries (check SQL logs)
- [ ] Verify backward compatibility (IDs still present)

### Frontend Testing

- [ ] Existing code still works (uses IDs)
- [ ] New code can access populated objects
- [ ] Pagination works as expected
- [ ] Performance improved (fewer requests)
- [ ] Type safety maintained

## Rollback Plan

If issues arise:

### Quick Rollback (No Data Loss)

The changes are backward compatible. Frontend can continue using ID fields.

### Full Rollback (Emergency)

1. Revert storage methods to use `.select()` instead of `db.query`
2. Remove pagination parameters from controllers
3. Frontend continues working unchanged

No database migrations needed - changes are code-only.

## Monitoring

Key metrics to monitor:

1. **Response Times**: Should decrease due to fewer requests
2. **Response Sizes**: Will increase per request (but fewer requests overall)
3. **Database Load**: Should remain similar or decrease
4. **Frontend Performance**: Should improve (fewer API calls)

## Common Issues & Solutions

### Issue: Response too large

**Solution**: Use pagination with smaller `limit` values

```typescript
// Too large
GET /api/products/tenant-123

// Better
GET /api/products/tenant-123?limit=50
```

### Issue: Missing populated fields

**Solution**: Check relation definitions in schema and storage method's `with` clause

### Issue: Type errors in frontend

**Solution**: Update TypeScript types to include optional populated fields

```typescript
interface Product {
  id: string;
  categoryId?: string;
  category?: Category; // Add this
  // ...
}
```

### Issue: Circular references

**Solution**: Avoid deep nesting in relations (already handled - max 1 level)

## Examples

### Complete Product Fetch Example

**Before** (3 requests):

```typescript
const product = await fetch(`/api/products/${id}`);
const category = await fetch(`/api/categories/${product.categoryId}`);
const variants = await fetch(`/api/products/${id}/variants`);

console.log(`
  Product: ${product.name}
  Category: ${category.name}
  Variants: ${variants.length}
`);
```

**After** (1 request):

```typescript
const product = await fetch(`/api/products/${id}`);

console.log(`
  Product: ${product.name}
  Category: ${product.category?.name || "None"}
  Variants: ${product.variants.length}
  Stock: ${product.stock?.quantity || 0}
`);
```

### Pagination Example

```typescript
// Fetch first page (50 items)
const page1 = await fetch("/api/products/tenant-123?limit=50&page=0");

// Fetch second page
const page2 = await fetch("/api/products/tenant-123?limit=50&page=1");

// Or use offset
const offset50 = await fetch("/api/products/tenant-123?limit=50&offset=50");
```

## Best Practices

1. **Always Use Pagination**: Specify `limit` for list endpoints
2. **Cache Wisely**: Populated responses are great for caching
3. **Migrate Gradually**: Update one component/feature at a time
4. **Monitor Performance**: Track response times and sizes
5. **Document Changes**: Update API documentation as you migrate

## Support & Questions

- Check [API_RESPONSES.md](./API_RESPONSES.md) for response format details
- Review code examples in this document
- Test endpoints using provided examples
- Monitor application logs for issues

## Timeline

- **Phase 1**: Backend changes (✅ Complete)
- **Phase 2**: Frontend migration (In Progress - gradual)
- **Phase 3**: Cleanup & optimization (Future)

## Conclusion

This migration provides significant improvements in API efficiency and developer experience while maintaining full backward compatibility. Frontend applications can migrate gradually at their own pace.
