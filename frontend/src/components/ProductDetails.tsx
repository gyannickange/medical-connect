import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductVariants } from "./ProductVariants";
import { ProductPricing } from "./ProductPricing";
import { ProductSales } from "./ProductSales";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Barcode from "react-barcode";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  DollarSign,
  BarChart3,
  Star,
  TrendingUp,
  TrendingDown,
  Eye,
  ShoppingCart,
  History,
  Trash2,
  Edit2,
  Check,
  X,
} from "lucide-react";
import { useTranslation } from "../lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import type { StockMovement } from "@shared/schema";
import { useLocation } from "wouter";
import { StockEntryModal } from "./StockEntryModal";
import { ProductModal } from "./ProductModal";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { usePolicy } from "@/hooks/usePolicy";
import { ProductsPolicy } from "@/lib/policies/products.policy";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { StockPolicy } from "@/lib/policies/stock.policy";
import { PolicyGuard } from "./PolicyGuard";
import {
  formatMovementDate,
  getMovementBadgeVariant,
  getQuantityChange,
} from "@/lib/movementFormat";

interface ProductDetailsProps {
  product: any;
  variants?: any[];
  categories?: any[];
  onProductUpdate?: () => void;
}

export const ProductDetails: React.FC<ProductDetailsProps> = ({
  product,
  variants = [],
  categories = [],
  onProductUpdate,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const { formatCurrency } = useNumberFormat();
  const productsPolicy = usePolicy(ProductsPolicy);
  const stockPolicy = usePolicy(StockPolicy);
  const [activeTab, setActiveTab] = useState("overview");
  const [, setLocation] = useLocation();
  const [showStockModal, setShowStockModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMinAlert, setEditingMinAlert] = useState(false);
  const [minAlertValue, setMinAlertValue] = useState(
    product.minStockAlert || 10
  );

  // Fetch stock movements for the product (not populated in product response)
  const { data: movements = [], isLoading: isLoadingMovements } = useQuery<
    StockMovement[]
  >({
    queryKey: ["/api/stock", product?.id, "movements"],
    queryFn: async () => {
      if (!product?.id) return [];
      const response = await offlineApiRequest(
        "GET",
        `/api/stock/${product.id}/movements`,
        undefined,
        { collection: "stock" }
      );
      if (!response.ok) throw new Error("Failed to fetch stock movements");
      const data = (await response.json()) as StockMovement[];
      // StockRepository.findByProduct guarantees newest-first, but an
      // offline-queued movement is appended to the end of the cached list
      // (see upsertCachedEntity) instead of re-sorted - without this, the
      // "most recent" lookups below silently pick a stale entry once any
      // movement has been recorded while offline.
      return [...data].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },
    enabled: !!product?.id,
  });

  // Get actual stock quantity - calculate from variants if they exist, otherwise use product.stocks.
  // Sums active variants only, matching the backend's materialized stocks.quantity
  // (ProductsRepository.planVariantAdjustment / aggregateVariantStock).
  const actualStock =
    variants.length > 0
      ? variants.reduce(
          (sum, v) => sum + (v.isActive !== false ? v.quantity || 0 : 0),
          0
        )
      : product.stocks?.quantity || 0;

  // Quick action handlers
  const handleAddToSale = () => {
    // Navigate to Dashboard (/) where sales functionality is located
    // The /pos route was removed and replaced with Dashboard
    setLocation(`/?productId=${product.id}`);
  };

  const handleAdjustStock = () => {
    setShowStockModal(true);
  };

  const handleEditProduct = () => {
    setShowEditModal(true);
  };

  const handleViewReports = () => {
    setLocation(`/reports?productId=${product.id}`);
  };

  const handleSaveMinAlert = async () => {
    try {
      const response = await offlineApiRequest(
        "PATCH",
        `/api/products/${product.id}`,
        {
          minStockAlert: minAlertValue,
        },
        { collection: "products", entityId: product.id }
      );

      if (!response.ok) throw new Error("Failed to update");

      setEditingMinAlert(false);
      toast({
        title: t("success"),
        description: t("minStockAlertUpdated"),
      });
      if (onProductUpdate) {
        onProductUpdate();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("failedToUpdateMinStockAlert"),
      });
    }
  };

  const handleCancelMinAlert = () => {
    setMinAlertValue(product.minStockAlert || 10);
    setEditingMinAlert(false);
  };

  const getStockStatus = (quantity: number, minAlert: number) => {
    if (quantity === 0)
      return { status: t("outOfStock"), variant: "danger" as const };
    if (quantity <= minAlert)
      return { status: t("lowStock"), variant: "warning" as const };
    return { status: t("inStock"), variant: "success" as const };
  };

  const stockStatus = getStockStatus(actualStock, product.minStockAlert || 10);

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

  const getMovementTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      entry: t("entry"),
      exit: t("exit"),
      adjustment: t("adjustment"),
      transfer: t("transfer"),
    };
    return (
      <Badge variant={getMovementBadgeVariant(type)}>
        {labels[type] || t("entry")}
      </Badge>
    );
  };

  const formatQuantityChange = (quantity: number, type: string) => {
    const { prefix, colorClass } = getQuantityChange(type);
    return (
      <span className={`font-mono font-semibold ${colorClass}`}>
        {prefix}
        {quantity}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Product Overview Header */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
            {/* Product Image */}
            <div className="flex-shrink-0">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-xl overflow-hidden bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 flex items-center justify-center border border-border">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="w-16 h-16 md:w-20 md:h-20 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Product Info */}
            <div className="flex-1 flex flex-col md:flex-row items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-start gap-3 flex-wrap">
                  <CardTitle className="text-lg md:text-xl font-display font-bold text-foreground flex-1 min-w-0">
                    {product.name}
                  </CardTitle>
                  <PolicyGuard policy={ProductsPolicy} action="canUpdate">
                    <Button
                      size="sm"
                      onClick={handleEditProduct}
                      className="flex items-center gap-1.5">
                      <Edit2 className="w-4 h-4" />
                      <span>{t("edit")}</span>
                    </Button>
                  </PolicyGuard>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={stockStatus.variant}>
                    {stockStatus.status}
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    {product.category?.name || t("uncategorized")}
                  </Badge>
                  <span className="text-muted-foreground">
                    {actualStock} {t("unitsInStock")}
                    {variants.length > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({t("stockFromVariants")}: {variants.length})
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {editingMinAlert ? (
                      <>
                        <Input
                          type="number"
                          value={minAlertValue}
                          onChange={(e) =>
                            setMinAlertValue(parseInt(e.target.value) || 0)
                          }
                          className="w-20 h-7 text-sm"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          aria-label={t("save")}
                          onClick={handleSaveMinAlert}>
                          <Check className="w-4 h-4 text-chart-positive" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          aria-label={t("cancel")}
                          onClick={handleCancelMinAlert}>
                          <X className="w-4 h-4 text-chart-negative" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm flex items-center gap-1">
                        {t("minAlert")}: {product.minStockAlert || 10}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 hover:bg-accent"
                          aria-label={t("edit")}
                          onClick={() => setEditingMinAlert(true)}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      </span>
                    )}
                  </div>
                </div>
                {/* Activity Summary */}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2">
                  {product.createdAt && (
                    <span>
                      {t("created")}:{" "}
                      {new Date(product.createdAt).toLocaleDateString()}
                    </span>
                  )}
                  {product.updatedAt && (
                    <span>
                      {t("updated")}:{" "}
                      {new Date(product.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              {/* Only show price/cost/margin if product has no variants */}
              {variants.length === 0 && (
                <div className="text-right space-y-2">
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(product.price || "0.00")}
                  </div>
                  {product.cost && productsPolicy.canViewCost() && (
                    <div className="text-sm text-muted-foreground">
                      {t("cost")}: {formatCurrency(product.cost)}
                    </div>
                  )}
                  {product.cost &&
                    product.price &&
                    productsPolicy.canViewCost() && (
                      <div
                        className={`text-sm font-medium ${
                          parseFloat(product.price) > parseFloat(product.cost)
                            ? "text-chart-positive"
                            : "text-chart-negative"
                        }`}>
                        {t("margin")}:{" "}
                        {parseFloat(product.price) > parseFloat(product.cost)
                          ? "+"
                          : ""}
                        {formatCurrency(
                          parseFloat(product.price) - parseFloat(product.cost)
                        )}
                      </div>
                    )}
                </div>
              )}
              {/* Show variants indicator if product has variants */}
              {variants.length > 0 && (
                <div className="text-right space-y-2">
                  <Badge variant="outline" className="text-sm px-3 py-1">
                    {variants.length}{" "}
                    {variants.length === 1 ? t("variant") : t("variants")}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {t("seePricingInVariantsTab")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <span
                  className={`text-xl font-bold font-mono ${
                    stockStatus.variant === "danger"
                      ? "text-danger"
                      : stockStatus.variant === "warning"
                        ? "text-warning"
                        : "text-foreground"
                  }`}>
                  {actualStock}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{t("stock")}</p>
            </div>
            {productsPolicy.canViewCost() && (
              <div className="text-center">
                <div className="text-xl font-bold text-foreground">
                  {formatCurrency(actualStock * parseFloat(product.cost || 0))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("totalStockValue")}
                </p>
              </div>
            )}
            <div className="text-center">
              <div className="text-xl font-bold text-foreground">
                {variants.length}
              </div>
              <p className="text-sm text-muted-foreground">{t("variants")}</p>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-foreground">
                {product.category?.name || t("uncategorized")}
              </div>
              <p className="text-sm text-muted-foreground">{t("category")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Features Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="glass-card p-1 inline-flex w-auto min-w-full md:w-full">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-accent-primary data-[state=active]:text-primary-foreground">
              <Package className="w-4 h-4 mr-2" />
              {t("overview")}
            </TabsTrigger>
            <TabsTrigger
              value="variants"
              className="data-[state=active]:bg-accent-primary data-[state=active]:text-primary-foreground">
              <Package className="w-4 h-4 mr-2" />
              {t("variants")}
              {variants.length > 0 && (
                <Badge className="ml-2 bg-accent-secondary text-primary-foreground">
                  {variants.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="pricing"
              className="data-[state=active]:bg-accent-primary data-[state=active]:text-primary-foreground">
              <DollarSign className="w-4 h-4 mr-2" />
              {t("pricing")}
            </TabsTrigger>
            <TabsTrigger
              value="sales"
              className="data-[state=active]:bg-accent-primary data-[state=active]:text-primary-foreground">
              <ShoppingCart className="w-4 h-4 mr-2" />
              {t("sales")}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="data-[state=active]:bg-accent-primary data-[state=active]:text-primary-foreground">
              <History className="w-4 h-4 mr-2" />
              {t("history")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="w-5 h-5" />
                  <span>{t("basicInformation")}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("description")}
                  </label>
                  <p className="text-foreground">
                    {product.description || t("noDescription")}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("barcode")}
                  </label>
                  {product.barcode ? (
                    <div className="mt-2">
                      <div className="inline-block bg-white border border-border p-1 rounded">
                        <Barcode
                          value={product.barcode}
                          format="CODE128"
                          width={1}
                          height={40}
                          displayValue={true}
                          fontSize={14}
                          margin={10}
                          background="white"
                          lineColor="black"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="font-mono text-foreground">{t("notSet")}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("minAlert")}
                  </label>
                  <p className="text-foreground">
                    {product.minStockAlert || 10} {t("units")}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("skuId")}
                  </label>
                  <p className="text-foreground font-mono text-sm">
                    {product.id?.substring(0, 8)}...
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Stock Information */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="w-5 h-5" />
                  <span>{t("stockInformation")}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("currentStock")}:
                  </span>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`font-semibold font-mono ${
                        stockStatus.variant === "danger"
                          ? "text-danger"
                          : stockStatus.variant === "warning"
                            ? "text-warning"
                            : "text-foreground"
                      }`}>
                      {actualStock}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("minAlert")}:
                  </span>
                  <span className="font-semibold text-foreground">
                    {product.minStockAlert || 10} {t("units")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("status")}:</span>
                  <Badge variant={stockStatus.variant}>
                    {stockStatus.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("movements")}:
                  </span>
                  <span className="font-semibold text-foreground">
                    {movements.length} {t("history")}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity Summary */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>{t("recentActivity")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {movements.length > 0 && (
                  <>
                    <div className="glass-input p-4 rounded-xl">
                      <p className="text-muted-foreground text-sm mb-1">
                        {t("lastRestocked")}
                      </p>
                      <p className="text-foreground font-semibold">
                        {movements.find((m) => m.type === "entry")
                          ? new Date(
                              movements.find(
                                (m) => m.type === "entry"
                              )!.createdAt
                            ).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                    <div className="glass-input p-4 rounded-xl">
                      <p className="text-muted-foreground text-sm mb-1">
                        {t("lastSold")}
                      </p>
                      <p className="text-foreground font-semibold">
                        {movements.find((m) => m.type === "exit")
                          ? new Date(
                              movements.find(
                                (m) => m.type === "exit"
                              )!.createdAt
                            ).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                    <div className="glass-input p-4 rounded-xl">
                      <p className="text-muted-foreground text-sm mb-1">
                        {t("soldThisMonth")}
                      </p>
                      <p className="text-foreground font-semibold">
                        {movements
                          .filter((m) => {
                            const movementDate = new Date(m.createdAt);
                            const now = new Date();
                            return (
                              m.type === "exit" &&
                              movementDate.getMonth() === now.getMonth() &&
                              movementDate.getFullYear() === now.getFullYear()
                            );
                          })
                          .reduce((sum, m) => sum + m.quantity, 0)}{" "}
                        {t("units")}
                      </p>
                    </div>
                  </>
                )}
                {movements.length === 0 && (
                  <div className="col-span-3 text-center text-muted-foreground py-4">
                    {t("noStockMovements")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>{t("quickActions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <button
                  className="quick-action group"
                  onClick={handleAddToSale}>
                  <ShoppingCart className="w-6 h-6 text-muted-foreground group-hover:text-accent-primary" />
                  <span className="text-sm text-muted-foreground group-hover:text-accent-primary">
                    {t("addToSale")}
                  </span>
                </button>
                <PolicyGuard policy={StockPolicy} action="canEntry">
                  <button
                    className="quick-action group"
                    onClick={handleAdjustStock}>
                    <Package className="w-6 h-6 text-muted-foreground group-hover:text-accent-primary" />
                    <span className="text-sm text-muted-foreground group-hover:text-accent-primary">
                      {t("adjustStock")}
                    </span>
                  </button>
                </PolicyGuard>
                <PolicyGuard policy={ProductsPolicy} action="canUpdate">
                  <button
                    className="quick-action group"
                    onClick={handleEditProduct}>
                    <DollarSign className="w-6 h-6 text-muted-foreground group-hover:text-accent-primary" />
                    <span className="text-sm text-muted-foreground group-hover:text-accent-primary">
                      {t("updatePrice")}
                    </span>
                  </button>
                </PolicyGuard>
                <button
                  className="quick-action group"
                  onClick={handleViewReports}>
                  <BarChart3 className="w-6 h-6 text-muted-foreground group-hover:text-accent-primary" />
                  <span className="text-sm text-muted-foreground group-hover:text-accent-primary">
                    {t("viewReports")}
                  </span>
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variants">
          <ProductVariants productId={product.id} productName={product.name} />
        </TabsContent>

        <TabsContent value="pricing">
          <ProductPricing
            productId={product.id}
            productName={product.name}
            productPrice={product.price}
            variants={variants}
          />
        </TabsContent>

        <TabsContent value="sales">
          <ProductSales productId={product.id} productName={product.name} />
        </TabsContent>

        <TabsContent value="history">
          <Card className="glass-card overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <History className="w-5 h-5" />
                <span>{t("stockHistory")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingMovements ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : movements.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 mx-auto text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground text-lg">
                    {t("noStockMovements")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("addFirstStockMovement")}
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-foreground">
                          {t("date")}
                        </TableHead>
                        {variants && variants.length > 0 && (
                          <TableHead className="text-foreground">
                            {t("variant")}
                          </TableHead>
                        )}
                        <TableHead className="text-foreground">
                          {t("movementType")}
                        </TableHead>
                        <TableHead className="text-foreground">
                          {t("change")}
                        </TableHead>
                        <TableHead className="text-foreground">
                          {t("previousQuantity")} → {t("newQuantity")}
                        </TableHead>
                        <TableHead className="text-foreground">
                          {t("reason")}
                        </TableHead>
                        <TableHead className="text-foreground">
                          {t("user")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((movement: StockMovement) => {
                        const movementWithVariant = movement as any;
                        const hasVariantId =
                          movementWithVariant.variantId &&
                          typeof movementWithVariant.variantId === "string" &&
                          movementWithVariant.variantId.trim() !== "";
                        const variantInfo =
                          movementWithVariant.variantAttributes
                            ? movementWithVariant.variantAttributes
                                .map(
                                  (attr: any) =>
                                    `${translateAttributeName(attr.name)}: ${
                                      attr.value
                                    }`
                                )
                                .join(", ")
                            : null;

                        return (
                          <TableRow
                            key={movement.id}
                            className="border-border"
                            data-testid={`movement-row-${movement.id}`}>
                            <TableCell className="text-sm">
                              {formatMovementDate(movement.createdAt)}
                            </TableCell>
                            {variants && variants.length > 0 && (
                              <TableCell className="text-sm">
                                {variantInfo ? (
                                  <div className="flex flex-col">
                                    <span className="text-foreground">
                                      {variantInfo}
                                    </span>
                                    {movementWithVariant.variantSku && (
                                      <span className="text-xs text-muted-foreground">
                                        SKU: {movementWithVariant.variantSku}
                                      </span>
                                    )}
                                  </div>
                                ) : hasVariantId ? (
                                  <span className="text-muted-foreground">
                                    {t("variant")} (
                                    {movementWithVariant.variantId.substring(
                                      0,
                                      8
                                    )}
                                    ...)
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground italic">
                                    {t("noVariant")}
                                  </span>
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              {getMovementTypeBadge(movement.type)}
                            </TableCell>
                            <TableCell>
                              {formatQuantityChange(
                                movement.quantity,
                                movement.type
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              <span className="text-muted-foreground">
                                {movement.previousQuantity}
                              </span>
                              <span className="mx-2">→</span>
                              <span className="text-foreground font-semibold">
                                {movement.newQuantity}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                              {movement.reason || "-"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {(movement as any).userName ||
                                movement.userId ||
                                "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Stock Modal */}
      <StockEntryModal
        isOpen={showStockModal}
        onClose={() => {
          setShowStockModal(false);
          // Refresh all product-related data after stock change
          onProductUpdate?.();
        }}
        mode="entry"
        preselectedProductId={product.id}
      />

      {/* Edit Product Modal */}
      <ProductModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          onProductUpdate?.();
        }}
        product={product}
      />
    </div>
  );
};
