import { z } from "zod";

export interface CouchDocument {
  _id: string;
  _rev?: string;
  type: string;
  tenantId: string;
}

type Money = string;
type MoneyInput = string | number;

export interface User { id: string; username: string; password: string; firstName: string; lastName: string; email: string | null; role: "admin" | "manager" | "cashier"; tenantId: string; isActive: boolean; createdAt: Date }
export interface InsertUser { id?: string; username: string; password: string; firstName: string; lastName: string; email?: string | null; role?: User["role"]; tenantId: string; isActive?: boolean }

export interface Tenant { id: string; name: string; address: string | null; phone: string | null; email: string | null; settings: unknown; isActive: boolean; createdAt: Date }
export interface InsertTenant { id?: string; name: string; address?: string | null; phone?: string | null; email?: string | null; settings?: unknown; isActive?: boolean }

export interface Category { id: string; name: string; description: string | null; tenantId: string; parentCategoryId: string | null; taxRate: Money | null; isDefault: boolean; createdAt: Date }
export interface InsertCategory { id?: string; name: string; description?: string | null; tenantId: string; parentCategoryId?: string | null; taxRate?: MoneyInput | null; isDefault?: boolean }

export interface Rayon { id: string; name: string; description: string | null; tenantId: string; createdAt: Date; updatedAt: Date }
export interface InsertRayon { id?: string; name: string; description?: string | null; tenantId: string }

export interface Product { id: string; name: string; description: string | null; price: Money; cost: Money; barcode: string | null; qrCode: string | null; categoryId: string | null; supplierId: string | null; rayonId: string | null; tenantId: string; minStockAlert: number; isActive: boolean; createdAt: Date; updatedAt: Date }
export interface InsertProduct { id?: string; name: string; description?: string | null; price: MoneyInput; cost: MoneyInput; barcode?: string | null; qrCode?: string | null; categoryId?: string | null; supplierId?: string | null; rayonId?: string | null; tenantId: string; minStockAlert?: number; isActive?: boolean }

export interface Stock { id: string; productId: string; quantity: number; reservedQuantity: number; tenantId: string; lastUpdated: Date }
export interface InsertStock { id?: string; productId: string; quantity?: number; reservedQuantity?: number; tenantId: string }

export type StockMovementType = "entry" | "exit" | "adjustment" | "transfer";
export interface StockMovement { id: string; productId: string; variantId: string | null; type: StockMovementType; quantity: number; previousQuantity: number; newQuantity: number; reason: string | null; priceType: string | null; unitPrice: Money | null; purchaseId: string | null; userId: string | null; tenantId: string; createdAt: Date }
export interface InsertStockMovement extends Omit<StockMovement, "id" | "createdAt"> { id?: string }

export interface Supplier { id: string; name: string; contactName: string | null; phone: string | null; email: string | null; tenantId: string; isActive: boolean; createdAt: Date }
export interface InsertSupplier { id?: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null; tenantId: string; isActive?: boolean }

export interface Customer { id: string; firstName: string; lastName: string; phone: string | null; email: string | null; address: string | null; tenantId: string; totalPurchases: Money; createdAt: Date }
export interface InsertCustomer { id?: string; firstName: string; lastName: string; phone?: string | null; email?: string | null; address?: string | null; tenantId: string; totalPurchases?: MoneyInput }

export type PaymentMethod = "cash" | "card" | "mobile";
export type SaleStatus = "pending" | "completed" | "cancelled" | "refunded";
export interface Sale { id: string; saleNumber: string; customerId: string | null; userId: string; subtotal: Money; tax: Money; total: Money; profit: Money; qrCode: string | null; paymentMethod: PaymentMethod; status: SaleStatus; tenantId: string; createdAt: Date }
export interface InsertSale { id?: string; customerId?: string | null; userId: string; subtotal?: MoneyInput; tax?: MoneyInput | null; total: MoneyInput; profit?: MoneyInput; qrCode?: string | null; paymentMethod: PaymentMethod; status?: SaleStatus; tenantId: string }
export interface SaleItem { id: string; saleId: string; productId: string; variantId: string | null; quantity: number; unitPrice: Money; totalPrice: Money; priceType: string | null; pricingId: string | null }
export interface InsertSaleItem { id?: string; saleId?: string; productId: string; variantId?: string | null; quantity: number; unitPrice: MoneyInput; totalPrice: MoneyInput; priceType?: string | null; pricingId?: string | null }

export interface ProductVariant { id: string; productId: string; attributes: Array<{ name: string; value: string }>; sku: string | null; price: Money | null; cost: Money | null; barcode: string | null; quantity: number; minStockAlert: number; isActive: boolean; tenantId: string; createdAt: Date; updatedAt: Date }
export interface InsertProductVariant { id?: string; productId: string; attributes: Array<{ name: string; value: string }>; sku?: string | null; price?: MoneyInput | null; cost?: MoneyInput | null; barcode?: string | null; quantity?: number; minStockAlert?: number; isActive?: boolean; tenantId: string }

export type ProductPriceType = "retail" | "wholesale" | "bulk" | "promotional";
export interface ProductPricing { id: string; productId: string; variantId: string | null; priceType: ProductPriceType; price: Money; minQuantity: number; maxQuantity: number | null; validFrom: Date | null; validTo: Date | null; isActive: boolean; tenantId: string; createdAt: Date }
export interface InsertProductPricing { id?: string; productId: string; variantId?: string | null; priceType: ProductPriceType; price: MoneyInput; minQuantity?: number; maxQuantity?: number | null; validFrom?: Date | string | null; validTo?: Date | string | null; isActive?: boolean; tenantId: string }

export interface ProductAnalytics { id: string; productId: string; variantId: string | null; date: Date; views: number; sales: number; revenue: Money; profit: Money; cost: Money; tenantId: string; createdAt: Date }
export interface InsertProductAnalytics extends Omit<ProductAnalytics, "id" | "createdAt" | "date" | "revenue" | "profit" | "cost"> { id?: string; date?: Date; revenue?: MoneyInput; profit?: MoneyInput; cost?: MoneyInput }
export interface SellingPriceEntry { id: string; variantId: string | null; price: Money; effectiveAt: Date; createdByUserId: string; createdAt: Date }
export interface InsertSellingPriceEntry { id?: string; variantId?: string | null; price: MoneyInput; effectiveAt?: Date | string; createdByUserId: string }

export interface PurchaseEntry { id: string; variantId: string | null; quantity: number; unitPurchasePrice: Money; purchaseCurrency: string; conversionRate: Money; referenceCurrency: string; unitCostConverted: Money; supplierId: string | null; purchaseDate: Date; createdByUserId: string; createdAt: Date }
export interface InsertPurchaseEntry { id?: string; variantId?: string | null; quantity: number; unitPurchasePrice: MoneyInput; purchaseCurrency: string; conversionRate: MoneyInput; supplierId?: string | null; purchaseDate?: Date | string; createdByUserId: string }

export interface ProductReview { id: string; productId: string; customerId: string | null; rating: number; comment: string | null; isVerified: boolean; tenantId: string; createdAt: Date }
export interface InsertProductReview extends Omit<ProductReview, "id" | "createdAt" | "customerId" | "comment" | "isVerified"> { id?: string; customerId?: string | null; comment?: string | null; isVerified?: boolean }

export type SyncState = "online" | "offline" | "syncing" | "error";
export interface SyncStatus { id: string; tenantId: string; deviceId: string; lastSync: Date | null; status: SyncState; pendingChanges: number }
export interface InsertSyncStatus { id?: string; tenantId: string; deviceId: string; lastSync?: Date | string | null; status?: SyncState; pendingChanges?: number }

export interface Setting { id: string; tenantId: string; key: string; value: string; category: string; dataType: string; isEncrypted: boolean; createdAt: Date; updatedAt: Date }
export interface InsertSetting { id?: string; tenantId?: string; key: string; value: string; category?: string; dataType?: string; isEncrypted?: boolean }

export interface AuditLog { id: string; userId: string; tenantId: string; action: "CREATE" | "UPDATE" | "DELETE" | "PATCH"; entityType: string; entityId: string | null; requestBody: unknown; responseBody: unknown; changes: unknown; metadata: unknown; status: "SUCCESS" | "FAILED"; errorMessage: string | null; createdAt: Date }
export interface InsertAuditLog extends Omit<AuditLog, "id" | "createdAt" | "entityId" | "requestBody" | "responseBody" | "changes" | "errorMessage"> { id?: string; entityId?: string | null; requestBody?: unknown; responseBody?: unknown; changes?: unknown; errorMessage?: string | null }

const id = z.string().uuid().optional();
const money = z.union([z.string(), z.number()]);
const nullableString = z.string().nullable().optional();

export const insertUserSchema = z.object({ id, username: z.string().min(1), password: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: nullableString, role: z.enum(["admin", "manager", "cashier"]).optional(), tenantId: z.string(), isActive: z.boolean().optional() });
export const insertTenantSchema = z.object({ id, name: z.string().min(1), address: nullableString, phone: nullableString, email: nullableString, settings: z.unknown().optional(), isActive: z.boolean().optional() });
export const insertCategorySchema = z.object({ id, name: z.string().min(1), description: nullableString, tenantId: z.string(), parentCategoryId: nullableString, taxRate: money.nullable().optional(), isDefault: z.boolean().optional() });
export const insertRayonSchema = z.object({ id, name: z.string().trim().min(1), description: nullableString, tenantId: z.string() });
export const insertProductSchema = z.object({ id, name: z.string().min(1), description: nullableString, price: money, cost: money, barcode: nullableString, qrCode: nullableString, categoryId: nullableString, supplierId: nullableString, rayonId: nullableString, tenantId: z.string(), minStockAlert: z.number().int().optional(), isActive: z.boolean().optional() });
export const insertStockSchema = z.object({ id, productId: z.string(), quantity: z.number().int().optional(), reservedQuantity: z.number().int().optional(), tenantId: z.string() });
export const insertStockMovementSchema = z.object({ id, productId: z.string(), variantId: nullableString, type: z.enum(["entry", "exit", "adjustment", "transfer"]), quantity: z.number().int(), previousQuantity: z.number().int(), newQuantity: z.number().int(), reason: nullableString, priceType: nullableString, unitPrice: money.nullable().optional(), purchaseId: nullableString, userId: nullableString, tenantId: z.string() });
export const insertSupplierSchema = z.object({ id, name: z.string().min(1), contactName: nullableString, phone: nullableString, email: nullableString, tenantId: z.string(), isActive: z.boolean().optional() });
export const insertCustomerSchema = z.object({ id, firstName: z.string().min(1), lastName: z.string().min(1), phone: nullableString, email: nullableString, address: nullableString, tenantId: z.string(), totalPurchases: money.optional() });
export const insertSaleSchema = z.object({ id, customerId: nullableString, userId: z.string(), subtotal: money.optional(), tax: money.nullable().optional(), total: money, profit: money.optional(), qrCode: nullableString, paymentMethod: z.enum(["cash", "card", "mobile"]), status: z.enum(["pending", "completed", "cancelled", "refunded"]).optional(), tenantId: z.string() });
export const insertSaleItemSchema = z.object({ id, saleId: z.string().optional(), productId: z.string(), variantId: nullableString, quantity: z.number().int(), unitPrice: money, totalPrice: money, priceType: nullableString, pricingId: nullableString });
export const insertSyncStatusSchema = z.object({ id, tenantId: z.string(), deviceId: z.string(), lastSync: z.union([z.date(), z.string()]).nullable().optional(), status: z.enum(["online", "offline", "syncing", "error"]).optional(), pendingChanges: z.number().int().optional() });
export const insertProductVariantSchema = z.object({ id, productId: z.string(), attributes: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).min(1), sku: nullableString, price: money.nullable().optional(), cost: money.nullable().optional(), barcode: nullableString, quantity: z.number().int().optional(), minStockAlert: z.number().int().optional(), isActive: z.boolean().optional(), tenantId: z.string() });
export const insertProductPricingSchema = z.object({ id, productId: z.string(), variantId: nullableString, priceType: z.enum(["retail", "wholesale", "bulk", "promotional"]), price: money, minQuantity: z.number().int().optional(), maxQuantity: z.number().int().nullable().optional(), validFrom: z.union([z.date(), z.string()]).nullable().optional(), validTo: z.union([z.date(), z.string()]).nullable().optional(), isActive: z.boolean().optional(), tenantId: z.string() });
export const insertProductAnalyticsSchema = z.object({ id, productId: z.string(), variantId: nullableString, date: z.date().optional(), views: z.number().int().optional(), sales: z.number().int().optional(), revenue: money.optional(), profit: money.optional(), cost: money.optional(), tenantId: z.string() });
export const insertSellingPriceEntrySchema = z.object({ id, variantId: nullableString, price: money, effectiveAt: z.union([z.date(), z.string()]).optional(), createdByUserId: z.string() });
export const insertPurchaseEntrySchema = z.object({ id, variantId: nullableString, quantity: z.number().int().min(1), unitPurchasePrice: money, purchaseCurrency: z.string().min(1), conversionRate: money, supplierId: nullableString, purchaseDate: z.union([z.date(), z.string()]).optional(), createdByUserId: z.string() });
export const insertProductReviewSchema = z.object({ id, productId: z.string(), customerId: nullableString, rating: z.number().int().min(1).max(5), comment: nullableString, isVerified: z.boolean().optional(), tenantId: z.string() });
export const insertSettingSchema = z.object({ id, tenantId: z.string().optional(), key: z.string().min(1), value: z.string(), category: z.string().optional(), dataType: z.string().optional(), isEncrypted: z.boolean().optional() });
export const insertAuditLogSchema = z.object({ id, userId: z.string(), tenantId: z.string(), action: z.enum(["CREATE", "UPDATE", "DELETE", "PATCH"]), entityType: z.string(), entityId: nullableString, requestBody: z.unknown().optional(), responseBody: z.unknown().optional(), changes: z.unknown().optional(), metadata: z.unknown(), status: z.enum(["SUCCESS", "FAILED"]), errorMessage: nullableString });
