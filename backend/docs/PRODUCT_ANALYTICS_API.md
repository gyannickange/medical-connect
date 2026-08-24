# Product Analytics API Documentation

## Overview

The Product Analytics API provides aggregated sales data for individual products, showing performance metrics by date over specified time ranges.

## Endpoint

```
GET /api/products/analytics/:productId
```

## Authentication

Protected endpoint requiring JWT authentication via `JwtAuthGuard`.

## Query Parameters

| Parameter   | Type   | Required | Description                       |
| ----------- | ------ | -------- | --------------------------------- |
| `productId` | string | Yes      | Unique product identifier         |
| `dateRange` | string | Yes      | Time range: `7d`, `30d`, or `90d` |
| `tenantId`  | string | Yes      | Tenant/shop identifier            |

## Date Range Options

- **`7d`**: Last 7 days
- **`30d`**: Last 30 days
- **`90d`**: Last 90 days

If an invalid dateRange is provided, defaults to `7d`.

## Response Format

Returns an array of daily analytics objects, sorted chronologically (oldest first).

```typescript
[
  {
    date: "2025-10-25T00:00:00.000Z",
    views: 0,
    sales: 15,
    revenue: "450.00",
    cost: "270.00",
    profit: "180.00",
  },
  {
    date: "2025-10-26T00:00:00.000Z",
    views: 0,
    sales: 23,
    revenue: "690.00",
    cost: "414.00",
    profit: "276.00",
  },
];
```

## Response Fields

| Field     | Type   | Description                                   |
| --------- | ------ | --------------------------------------------- |
| `date`    | string | ISO 8601 date timestamp                       |
| `views`   | number | Product page views (currently returns 0)      |
| `sales`   | number | Quantity of items sold (sum per day)          |
| `revenue` | string | Total revenue in decimal format               |
| `cost`    | string | Total cost of goods sold in decimal format    |
| `profit`  | string | Net profit (revenue - cost) in decimal format |

## Example Requests

### Get last 7 days of analytics

```bash
curl -X GET "http://localhost:3000/api/products/analytics/prod-123?dateRange=7d&tenantId=tenant-456" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get last 30 days of analytics

```bash
curl -X GET "http://localhost:3000/api/products/analytics/prod-123?dateRange=30d&tenantId=tenant-456" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Data Aggregation

The analytics are calculated by:

1. Querying all `saleItems` for the specified product
2. Filtering by `tenantId` and date range
3. Grouping by date (day granularity)
4. Aggregating per day:
   - **sales**: Sum of quantities sold
   - **revenue**: Sum of `unitPrice × quantity`
   - **cost**: Sum of `product.cost × quantity`
   - **profit**: `revenue - cost`
   - **views**: 0 (tracking not yet implemented)

## Implementation Details

### Backend Architecture

- **Controller**: `ProductsController.getAnalytics()`
- **Service**: `ProductsService.getProductAnalytics()`
- **Storage**: `DatabaseStorage.getProductAnalyticsByDateRange()`

### Database Queries

Uses Drizzle ORM with:

- Join: `saleItems` → `sales` → `products`
- Filter: `productId`, `tenantId`, date range
- Aggregate: Group by DATE and calculate totals

### Frontend Usage

Currently used exclusively in the **ProductSales** component to display:

- Analytics stats cards (Views, Units Sold, Revenue, Profit, Profit Margin)
- Performance insights with date range selector

## Error Handling

- **404**: Product not found (handled by service layer)
- **401**: Authentication required
- **400**: Invalid query parameters

## Future Enhancements

- Implement views tracking system
- Add caching for frequently accessed analytics
- Support custom date ranges
- Add additional metrics (average order value, conversion rate, etc.)
