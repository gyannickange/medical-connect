import React, { useState } from "react";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useCurrency } from "../hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Filter,
  Eye,
  Calendar,
  User,
  Package,
  TrendingUp,
  X,
  BarChart3,
  DollarSign,
  TrendingDown,
} from "lucide-react";
import { format } from "date-fns";
import { offlineApiRequest } from "@/lib/offlineApiRequest";

interface Sale {
  id: string;
  saleNumber: string;
  customerId?: string;
  customer?: {
    id: string;
    name: string;
    email?: string;
  };
  items: Array<{
    id: string;
    variantId?: string;
    product: {
      id: string;
      name: string;
      price: string;
      cost: string;
    };
    variant?: {
      id: string;
      attributes?: Array<{ name: string; value: string }>;
      sku?: string;
      cost?: string | null;
    };
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    priceType?: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface AnalyticsData {
  views: number;
  sales: number;
  revenue: string;
  profit: string;
  cost: string;
  date: string;
}

interface ProductSalesProps {
  productId: string;
  productName: string;
}

export const ProductSales: React.FC<ProductSalesProps> = ({
  productId,
  productName,
}) => {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { formatAmount } = useCurrency();

  // Helper function to translate attribute names
  const translateAttributeName = (name: string): string => {
    const translationMap: Record<string, string> = {
      Size: t("variantTypeSize"),
      Color: t("variantTypeColor"),
      Material: t("variantTypeMaterial"),
      Style: t("variantTypeStyle"),
      Weight: t("variantTypeWeight"),
      Other: t("variantTypeOther"),
    };
    return translationMap[name] || name;
  };

  // Helper function to get price type badge
  const getPriceTypeBadge = (priceType?: string) => {
    if (!priceType || priceType === "auto" || priceType === "none") {
      return null;
    }
    const badges: Record<string, { label: string; className: string }> = {
      retail: {
        label: t("retail"),
        className: "bg-green-500/20 text-green-700 dark:text-green-400",
      },
      wholesale: {
        label: t("wholesale"),
        className: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
      },
      bulk: {
        label: t("bulk"),
        className: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
      },
      promotional: {
        label: t("promotion"),
        className: "bg-red-500/20 text-red-700 dark:text-red-400",
      },
    };
    const badge = badges[priceType] || {
      label: priceType,
      className: "bg-gray-500/20 text-gray-700 dark:text-gray-400",
    };
    return (
      <Badge
        variant="outline"
        className={`text-xs ${badge.className} border-0`}>
        {badge.label}
      </Badge>
    );
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today"); // Default to today
  const [dateRange, setDateRange] = useState("7d"); // Analytics date range
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showSaleDetails, setShowSaleDetails] = useState(false);

  // Fetch analytics data
  const { data: analytics = [], isLoading: analyticsLoading } = useQuery<
    AnalyticsData[]
  >({
    queryKey: [
      "/api/products/analytics",
      productId,
      dateRange,
      currentTenant?.id,
    ],
    queryFn: async () => {
      const response = await offlineApiRequest(
        "GET",
        `/api/products/analytics/${productId}?dateRange=${dateRange}&tenantId=${currentTenant?.id}`,
        undefined,
        { collection: "products" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }
      return response.json();
    },
    enabled: !!productId && !!currentTenant?.id,
  });

  // Fetch sales for this product
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["/api/sales/product", productId, currentTenant?.id],
    queryFn: async () => {
      const response = await offlineApiRequest(
        "GET",
        `/api/sales/product/${productId}?tenantId=${currentTenant?.id}`,
        undefined,
        { collection: "sales" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch sales");
      }
      const salesData = await response.json();

      // Process sales data to ensure variant structure is correct
      // Sometimes Drizzle returns variant as null even when variantId exists
      const processedSales = salesData.map((sale: any) => ({
        ...sale,
        items:
          sale.items?.map((item: any) => {
            // If variantId exists but variant is null/undefined, keep variantId for fallback
            if (item.variantId && !item.variant) {
              // Variant relation might not have loaded, but variantId exists
              // We'll handle this in the UI by checking variantId
              return { ...item, variantId: item.variantId };
            }
            return item;
          }) || [],
      }));

      return processedSales;
    },
    enabled: !!currentTenant?.id && !!productId,
  });

  // Calculate analytics totals
  const calculateAnalyticsTotals = (data: AnalyticsData[]) => {
    return data.reduce(
      (totals, item) => ({
        views: totals.views + item.views,
        sales: totals.sales + item.sales,
        revenue: totals.revenue + parseFloat(item.revenue),
        profit: totals.profit + parseFloat(item.profit),
        cost: totals.cost + parseFloat(item.cost),
      }),
      { views: 0, sales: 0, revenue: 0, profit: 0, cost: 0 }
    );
  };

  const analyticsTotals = calculateAnalyticsTotals(analytics);

  // Date filtering logic
  const getDateRange = (period: string) => {
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "today":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      default:
        return null;
    }

    return dateFilter === "all" ? null : startDate;
  };

  // Filter sales based on search and filters
  const filteredSales = React.useMemo(() => {
    const dateRange = getDateRange(dateFilter);

    let filtered = (sales as Sale[]).filter((sale) => {
      const matchesSearch =
        sale.saleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sale.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || sale.status === statusFilter;

      // Add date filtering
      if (dateRange) {
        const saleDate = new Date(sale.createdAt);
        if (saleDate < dateRange) return false;
      }

      return matchesSearch && matchesStatus;
    });

    // Sort by creation date (newest first)
    return filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [sales, searchQuery, statusFilter, dateFilter]);

  const handleViewSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowSaleDetails(true);
  };

  const handleCloseSaleDetails = () => {
    setSelectedSale(null);
    setShowSaleDetails(false);
  };

  if (isLoading || analyticsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Analytics Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-display font-semibold text-foreground">
          {t("productAnalytics")}
        </h3>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="glass-input w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-card border-border">
                <SelectItem value="7d">{t("last7Days")}</SelectItem>
                <SelectItem value="30d">{t("last30Days")}</SelectItem>
                <SelectItem value="90d">{t("last90Days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Analytics Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-text-secondary">{t("unitsSold")}</p>
            <Package className="h-4 w-4 text-text-secondary" />
          </div>
          <p className="text-xl font-bold text-foreground">
            {analyticsTotals.sales.toLocaleString()}
          </p>
          <p className="text-xs text-text-secondary">
            {t("totalQuantitySold")}
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-text-secondary">{t("revenue")}</p>
            <DollarSign className="h-4 w-4 text-text-secondary" />
          </div>
          <p className="text-xl font-bold text-foreground">
            {formatAmount(analyticsTotals.revenue)}
          </p>
          <p className="text-xs text-text-secondary">{t("totalSalesValue")}</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-text-secondary">{t("profit")}</p>
            <TrendingUp className="h-4 w-4 text-text-secondary" />
          </div>
          <p
            className={`text-xl font-bold ${
              analyticsTotals.profit >= 0 ? "text-chart-positive" : "text-chart-negative"
            }`}>
            {analyticsTotals.profit >= 0 ? "+" : "-"}
            {formatAmount(Math.abs(analyticsTotals.profit))}
          </p>
          <p className="text-xs text-text-secondary">{t("netProfitEarned")}</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-text-secondary">{t("totalCost")}</p>
            <BarChart3 className="h-4 w-4 text-text-secondary" />
          </div>
          <p className="text-xl font-bold text-foreground">
            {formatAmount(analyticsTotals.cost)}
          </p>
          <p className="text-xs text-text-secondary">{t("costOfGoodsSold")}</p>
        </div>
      </div>

      {/* Sales Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">
            {t("salesHistory")} ({filteredSales.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-foreground">
                  {t("saleNumber")}
                </TableHead>
                <TableHead className="text-foreground">{t("date")}</TableHead>
                <TableHead className="text-foreground">
                  {t("customer")}
                </TableHead>
                <TableHead className="text-foreground">
                  {t("variant")}
                </TableHead>
                <TableHead className="text-foreground">
                  {t("quantity")}
                </TableHead>
                <TableHead className="text-foreground">{t("amount")}</TableHead>
                <TableHead className="text-foreground">{t("profit")}</TableHead>
                <TableHead className="text-foreground">
                  {t("actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="text-center">
                      <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground text-lg mb-2">
                        {t("noSalesFound")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("noSalesFoundForProduct")}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((sale) => {
                  const productItems = sale.items.filter(
                    (item) => item.product.id === productId
                  );

                  const totalQuantity = productItems.reduce(
                    (sum, item) => sum + item.quantity,
                    0
                  );
                  const totalAmount = productItems.reduce(
                    (sum, item) => sum + item.totalPrice,
                    0
                  );
                  const totalProfit = productItems.reduce((sum, item) => {
                    // Match backend's cost resolution (variant cost falls
                    // back to product cost) used in SalesService.
                    // aggregateByDate / ProductsRepository.getProductAnalytics.
                    const cost = parseFloat(
                      item.variant?.cost ?? item.product.cost
                    );
                    const profitPerItem = item.unitPrice - cost;
                    return sum + profitPerItem * item.quantity;
                  }, 0);

                  return (
                    <TableRow
                      key={sale.id}
                      className="border-border hover:bg-muted">
                      <TableCell className="font-medium text-foreground">
                        #{sale.saleNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {format(
                              new Date(sale.createdAt),
                              "dd/MM/yyyy HH:mm"
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {sale.customer ? (
                          <div className="flex items-center space-x-2">
                            <User className="w-4 h-4" />
                            <span>{sale.customer.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("noCustomer")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {productItems.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {productItems.map((item, idx) => {
                              // Check for variant - either as object or by variantId
                              const hasVariantId =
                                item.variantId &&
                                typeof item.variantId === "string" &&
                                item.variantId.trim() !== "";
                              const hasVariant =
                                item.variant &&
                                typeof item.variant === "object";

                              return (
                                <div key={idx} className="flex flex-col gap-1">
                                  <div className="flex flex-wrap gap-1">
                                    {hasVariant && item.variant ? (
                                      <>
                                        {item.variant.attributes &&
                                        Array.isArray(
                                          item.variant.attributes
                                        ) &&
                                        item.variant.attributes.length > 0 ? (
                                          item.variant.attributes.map(
                                            (attr: any, attrIdx: number) => (
                                              <span
                                                key={attrIdx}
                                                className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent-primary/20 text-accent-primary text-xs">
                                                {translateAttributeName(
                                                  attr.name
                                                )}
                                                : {attr.value}
                                              </span>
                                            )
                                          )
                                        ) : (
                                          <span className="text-xs text-muted-foreground">
                                            {item.variant.sku || t("variant")}
                                          </span>
                                        )}
                                      </>
                                    ) : hasVariantId && item.variantId ? (
                                      <span className="text-xs text-muted-foreground">
                                        {t("variant")} (
                                        {item.variantId.substring(0, 8)}...)
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground italic">
                                        {t("noVariant")}
                                      </span>
                                    )}
                                    {/* Price type badge */}
                                    {getPriceTypeBadge(item.priceType)}
                                  </div>
                                  {/* Show unit price if available */}
                                  {item.unitPrice && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {t("unitPrice")}:{" "}
                                      {formatAmount(item.unitPrice)}
                                      {item.priceType &&
                                        item.priceType !== "auto" &&
                                        item.priceType !== "none" && (
                                          <span className="ml-1">
                                            (
                                            {(() => {
                                              const priceTypeLabels: Record<
                                                string,
                                                string
                                              > = {
                                                retail: t("retail"),
                                                wholesale: t("wholesale"),
                                                bulk: t("bulk"),
                                                promotional: t("promotion"),
                                              };
                                              return (
                                                priceTypeLabels[
                                                  item.priceType
                                                ] || item.priceType
                                              );
                                            })()}
                                            )
                                          </span>
                                        )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">
                            {t("noVariant")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center space-x-2">
                          <Package className="w-4 h-4" />
                          <span>{totalQuantity}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-foreground">
                        {formatAmount(totalAmount)}
                      </TableCell>
                      <TableCell
                        className={`font-mono font-semibold ${
                          totalProfit >= 0 ? "text-chart-positive" : "text-chart-negative"
                        }`}>
                        {totalProfit >= 0 ? "+" : "-"}
                        {formatAmount(Math.abs(totalProfit))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewSaleDetails(sale)}
                          className="text-primary hover:bg-accent"
                          data-testid={`button-view-sale-${sale.id}`}>
                          <Eye className="w-4 h-4 mr-1" />
                          {t("viewDetails")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Sale Details Modal */}
      <Dialog open={showSaleDetails} onOpenChange={setShowSaleDetails}>
        <DialogContent className="glass-card max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold text-foreground">
                {t("saleDetails")} #{selectedSale?.saleNumber}
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSaleDetails(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-close-sale-details">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-6">
              {/* Sale Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-foreground mb-3">
                    {t("saleInformation")}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("saleNumber")}:
                      </span>
                      <span className="font-mono">
                        #{selectedSale.saleNumber}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("date")}:
                      </span>
                      <span>
                        {format(
                          new Date(selectedSale.createdAt),
                          "dd/MM/yyyy HH:mm"
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-4">
                  <h4 className="font-semibold text-foreground mb-3">
                    {t("customerInformation")}
                  </h4>
                  <div className="space-y-2 text-sm">
                    {selectedSale.customer ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("name")}:
                          </span>
                          <span>{selectedSale.customer.name}</span>
                        </div>
                        {selectedSale.customer.email && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("email")}:
                            </span>
                            <span>{selectedSale.customer.email}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">{t("noCustomer")}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Product Items in this Sale */}
              <div className="glass-card p-4">
                <h4 className="font-semibold text-foreground mb-3">
                  {t("productInSale")}
                </h4>
                <div className="space-y-3">
                  {selectedSale.items
                    .filter((item) => item.product.id === productId)
                    .map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium text-foreground">
                            {item.product.name}
                          </p>
                          {(() => {
                            // Check for variant - either as object or by variantId
                            const hasVariantId =
                              item.variantId &&
                              typeof item.variantId === "string" &&
                              item.variantId.trim() !== "";
                            const hasVariant =
                              item.variant && typeof item.variant === "object";

                            return (
                              <div className="flex flex-col gap-1 mt-1">
                                {hasVariant && item.variant ? (
                                  <div className="flex flex-wrap gap-1">
                                    {item.variant.attributes &&
                                    Array.isArray(item.variant.attributes) &&
                                    item.variant.attributes.length > 0 ? (
                                      item.variant.attributes.map(
                                        (attr: any, attrIdx: number) => (
                                          <span
                                            key={attrIdx}
                                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent-primary/20 text-accent-primary text-xs">
                                            {translateAttributeName(attr.name)}:{" "}
                                            {attr.value}
                                          </span>
                                        )
                                      )
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        {item.variant.sku || t("variant")}
                                      </span>
                                    )}
                                    {/* Price type badge */}
                                    {getPriceTypeBadge(item.priceType)}
                                  </div>
                                ) : hasVariantId && item.variantId ? (
                                  <div className="flex flex-wrap gap-1">
                                    <span className="text-xs text-muted-foreground">
                                      {t("variant")} (
                                      {item.variantId.substring(0, 8)}...)
                                    </span>
                                    {/* Price type badge */}
                                    {getPriceTypeBadge(item.priceType)}
                                  </div>
                                ) : (
                                  /* Price type badge when no variants */
                                  <div className="flex flex-wrap gap-1">
                                    {getPriceTypeBadge(item.priceType)}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatAmount(item.unitPrice)} × {item.quantity}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-foreground">
                            {formatAmount(item.totalPrice)}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
