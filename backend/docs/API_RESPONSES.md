# API Response Format Documentation

## Overview

All API endpoints now return enriched data with populated foreign key relationships. This document describes the new response formats and how to use them effectively.

## Key Changes

### Before (ID-only responses)

```json
{
  "id": "product-123",
  "name": "T-Shirt",
  "categoryId": "cat-456",
  "tenantId": "tenant-789",
  "price": "29.99"
}
```

### After (Populated responses)

```json
{
  "id": "product-123",
  "name": "T-Shirt",
  "categoryId": "cat-456",
  "category": {
    "id": "cat-456",
    "name": "Clothing",
    "tenantId": "tenant-789"
  },
  "tenantId": "tenant-789",
  "tenant": {
    "id": "tenant-789",
    "name": "My Shop",
    "address": "123 Main St"
  },
  "variants": [
    {
      "id": "var-111",
      "attributes": [{ "name": "Size", "value": "Large" }],
      "sku": "TSHIRT-L",
      "quantity": 50
    }
  ],
  "stock": {
    "id": "stock-222",
    "quantity": 150,
    "productId": "product-123"
  },
  "price": "29.99"
}
```

## Benefits

1. **Reduced API Calls**: No need for separate requests to fetch related data
2. **Backward Compatible**: ID fields still present for existing code
3. **Type Safe**: Full objects with all properties
4. **Efficient**: Uses database joins (no N+1 queries)

## Response Formats by Endpoint

### Products

#### GET /api/products/:tenantId

```typescript
[
  {
    id: string;
    name: string;
    description?: string;
    price: string;
    cost?: string;
    barcode?: string;
    sku?: string;
    minStockAlert: number;
    categoryId?: string;
    category?: {
      id: string;
      name: string;
      description?: string;
      tenantId: string;
    };
    tenantId: string;
    tenant: {
      id: string;
      name: string;
      address?: string;
      phone?: string;
      email?: string;
    };
    variants: Array<{
      id: string;
      productId: string;
      attributes: Array<{name: string; value: string}>;
      sku?: string;
      price?: number;
      cost?: number;
      barcode?: string;
      quantity: number;
      minStockAlert: number;
    }>;
    stock?: {
      id: string;
      productId: string;
      quantity: number;
      reservedQuantity: number;
      tenantId: string;
    };
    createdAt: Date;
  }
]
```

#### GET /api/products/barcode/:tenantId/:barcode

Returns single product with same populated structure as above.

#### GET /api/products/:tenantId/search?q=query

Returns array of products with same structure as list endpoint.

### Sales

#### GET /api/sales/:tenantId

```typescript
[
  {
    id: string;
    total: string;
    subtotal: string;
    tax?: string;
    discount?: string;
    paymentMethod: string;
    customerId?: string;
    customer?: {
      id: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      tenantId: string;
    };
    userId: string;
    user: {
      id: string;
      username: string;
      firstName: string;
      lastName: string;
      role: string;
      tenantId: string;
    };
    tenantId: string;
    tenant: {
      id: string;
      name: string;
    };
    items: Array<{
      id: string;
      saleId: string;
      productId: string;
      product: {
        id: string;
        name: string;
        price: string;
        categoryId?: string;
      };
      quantity: number;
      unitPrice: string;
      totalPrice: string;
    }>;
    createdAt: Date;
  }
]
```

### Customers

#### GET /api/customers/:tenantId

```typescript
[
  {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    address?: string;
    totalPurchases: string;
    tenantId: string;
    tenant: {
      id: string;
      name: string;
    };
    createdAt: Date;
  }
]
```

### Stock

#### GET /api/stock/:tenantId

```typescript
[
  {
    id: string;
    productId: string;
    product: {
      id: string;
      name: string;
      price: string;
      category?: {
        id: string;
        name: string;
      };
      variants: Array<{
        id: string;
        attributes: Array<{name: string; value: string}>;
        quantity: number;
      }>;
    };
    tenantId: string;
    tenant: {
      id: string;
      name: string;
    };
    quantity: number;
    reservedQuantity: number;
    lastUpdated: Date;
  }
]
```

### Staff (Users)

#### GET /api/staff/:tenantId

```typescript
[
  {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email?: string;
    role: "admin" | "manager" | "cashier";
    tenantId: string;
    tenant: {
      id: string;
      name: string;
    };
    isActive: boolean;
    createdAt: Date;
    // Note: password field is excluded for security
  }
]
```

### Categories

#### GET /api/categories/:tenantId

```typescript
[
  {
    id: string;
    name: string;
    description?: string;
    tenantId: string;
    tenant: {
      id: string;
      name: string;
    };
    products: Array<{
      id: string;
      name: string;
      price: string;
    }>;
    createdAt: Date;
  }
]
```

## Pagination Parameters

All list endpoints now support optional pagination query parameters:

### Query Parameters

- `limit` (number): Number of items to return (default: 100, max: 1000)
- `offset` (number): Number of items to skip (default: 0)
- `page` (number): Page number (alternative to offset, calculated as page \* limit)

### Examples

```bash
# Get first 20 products
GET /api/products/tenant-123?limit=20

# Get products 21-40 (using offset)
GET /api/products/tenant-123?limit=20&offset=20

# Get page 2 of products (page size 20)
GET /api/products/tenant-123?limit=20&page=1  # page is 0-indexed

# Get first 50 sales
GET /api/sales/tenant-123?limit=50

# Search with pagination
GET /api/products/tenant-123/search?q=shirt&limit=10
```

## Migration Guide for Frontend

### Gradual Migration Approach

The API maintains backward compatibility by keeping both ID fields and populated objects:

#### Step 1: Keep using IDs (no changes needed)

```typescript
// This still works
const product = await fetch("/api/products/tenant-123");
console.log(product.categoryId); // Still available
```

#### Step 2: Start using populated objects (optional)

```typescript
// New way - no additional requests needed
const product = await fetch("/api/products/tenant-123");
console.log(product.category.name); // Direct access to category name
```

#### Step 3: Remove redundant API calls

```typescript
// Before
const product = await fetch(`/api/products/${productId}`);
const category = await fetch(`/api/categories/${product.categoryId}`);
console.log(category.name);

// After
const product = await fetch(`/api/products/${productId}`);
console.log(product.category.name); // One request instead of two
```

## Performance Considerations

### Database Joins

All population is done via efficient SQL joins at the database level. No N+1 query problems.

### Pagination

Use pagination for large datasets to avoid loading excessive data:

```typescript
// Bad: Loading all products (could be thousands)
const products = await fetch("/api/products/tenant-123");

// Good: Loading 100 at a time
const products = await fetch("/api/products/tenant-123?limit=100");
```

### Selective Population

The system automatically includes the most commonly needed relations. Deep nesting is avoided for performance.

## Best Practices

1. **Use Pagination**: Always specify `limit` for list endpoints
2. **Cache Responses**: Populated responses are larger; cache them when possible
3. **Gradual Migration**: Update frontend code incrementally
4. **Type Safety**: Update TypeScript types to reflect new response structure
5. **Error Handling**: Same error handling as before; population doesn't change error responses

## Error Responses

Error responses remain unchanged:

```json
{
  "statusCode": 404,
  "message": "Product not found",
  "error": "Not Found"
}
```

## Future Enhancements

Planned for future releases:

- Query parameter to control population depth
- Selective field inclusion (GraphQL-style)
- Response compression for large datasets
- Real-time updates via WebSocket

## Support

For questions or issues:

1. Check this documentation
2. Review POPULATION_MIGRATION.md for detailed migration steps
3. Test endpoints using provided examples
4. Report issues with API version and endpoint details
