import React, { useState, useEffect } from "react";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  Plus,
  BarChart3,
  ShoppingCart,
  Scan,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MetricsCard } from "../components/MetricsCard";
import { ProductModal } from "../components/ProductModal";
import { StockEntryModal } from "../components/StockEntryModal";
import { SaleModal } from "../components/SaleModal";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { findProductByBarcode } from "@/lib/offlineApiRequest";
import { resolveProductPrice } from "@/lib/resolveProductPrice";

export default function Dashboard() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { formatCurrency } = useNumberFormat();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showProductModal, setShowProductModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [saleTotal, setSaleTotal] = useState(0);

  // Fetch dashboard data
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["/api/dashboard", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  // Open sale modal when navigated with ?openSaleModal=1 (e.g. from Reports)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openSaleModal") === "1") {
      setShowSaleModal(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("openSaleModal");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  const handleAddItem = (item: any) => {
    // Find existing item using composite key (productId + variantId)
    // This ensures we match the exact same product-variant combination
    const existingItem = saleItems.find(
      (saleItem) =>
        saleItem.product.id === item.product.id &&
        (saleItem.variantId || undefined) === (item.variantId || undefined)
    );

    if (existingItem) {
      // Pass variantId to handleUpdateQuantity for composite key matching
      handleUpdateQuantity(
        item.product.id,
        existingItem.quantity + 1,
        undefined,
        item.variantId
      );
    } else {
      setSaleItems((prev) => [...prev, item]);
      setSaleTotal((prev) => prev + item.totalPrice);
    }
  };

  const handleRemoveItem = (productId: string, variantId?: string) => {
    // Find the specific item using composite key (productId + variantId)
    const item = saleItems.find(
      (saleItem) =>
        saleItem.product.id === productId &&
        (saleItem.variantId || undefined) === (variantId || undefined)
    );
    if (item) {
      // Remove only the item that matches both productId and variantId
      setSaleItems((prev) =>
        prev.filter(
          (saleItem) =>
            !(
              saleItem.product.id === productId &&
              (saleItem.variantId || undefined) === (variantId || undefined)
            )
        )
      );
      setSaleTotal((prev) => prev - item.totalPrice);
    }
  };

  const handleUpdateQuantity = async (
    productId: string,
    newQuantity: number,
    priceTypeOverride?: string,
    variantId?: string
  ) => {
    if (newQuantity <= 0) {
      handleRemoveItem(productId, variantId);
      return;
    }

    // Find the specific item using composite key (productId + variantId)
    const item = saleItems.find(
      (i) =>
        i.product.id === productId &&
        (i.variantId || undefined) === (variantId || undefined)
    );
    if (!item) return;

    // item.product is a snapshot captured when the item was added to the
    // cart - a pricing rule created/edited afterward (ProductPricing.tsx)
    // never reaches it, even though the products query cache itself is
    // correctly kept up to date. Re-resolve from the live query cache
    // (shared with SaleModal's own products query, same queryKey) so a
    // price type picked from the dropdown always sees current rules.
    const cachedProducts = queryClient.getQueryData<any[]>([
      "/api/products",
      currentTenant?.id,
    ]);
    const freshProduct =
      cachedProducts?.find((p) => p.id === productId) ?? item.product;
    const freshVariant = variantId
      ? (freshProduct.variants ?? []).find((v: any) => v.id === variantId) ??
        item.variant
      : item.variant;

    // "none" is an explicit cashier choice (from the override dropdown) to
    // ignore all pricing rules and bill at the base product/variant price.
    // It is NOT the same as "no choice made yet" - undefined/"auto" means
    // the cashier hasn't overridden anything, so the best matching rule for
    // the current quantity (e.g. a bulk-quantity tier) is auto-detected
    // below via resolveProductPrice, instead of always billing at the base
    // price regardless of quantity.
    if (priceTypeOverride === "none") {
      const basePrice = freshVariant?.price
        ? parseFloat(freshVariant.price)
        : parseFloat(freshProduct.price);
      const newUnitPrice = basePrice;
      const newTotal = newQuantity * newUnitPrice;

      setSaleItems((prev) =>
        prev.map((i) => {
          if (
            i.product.id === productId &&
            (i.variantId || undefined) === (variantId || undefined)
          ) {
            return {
              ...i,
              quantity: newQuantity,
              unitPrice: newUnitPrice,
              totalPrice: newTotal,
              priceType: undefined,
              appliedRule: undefined,
            };
          }
          return i;
        })
      );

      // Update total
      const oldTotal = item.totalPrice;
      setSaleTotal((prevTotal) => prevTotal - oldTotal + newTotal);
      return;
    }

    // Recalculate price based on new quantity. Resolved locally from the
    // item's already-replicated product (pricingRules/variants), mirroring
    // the backend's calculateProductPrice exactly, so this works offline and
    // always agrees with what SalesService.resolveAndVerify recomputes on
    // sync (see frontend/src/lib/resolveProductPrice.ts). "auto"/undefined
    // is passed through as undefined so resolveProductPrice auto-detects
    // the best matching rule instead of filtering to one type.
    const priceData = resolveProductPrice(
      freshProduct,
      newQuantity,
      variantId,
      priceTypeOverride === "auto" ? undefined : priceTypeOverride
    );
    const newUnitPrice = parseFloat(priceData.price);
    const newTotal = newQuantity * newUnitPrice;

    setSaleItems((prev) =>
      prev.map((i) => {
        if (
          i.product.id === productId &&
          (i.variantId || undefined) === (variantId || undefined)
        ) {
          return {
            ...i,
            quantity: newQuantity,
            unitPrice: newUnitPrice,
            totalPrice: newTotal,
            priceType: priceData.rule?.priceType,
            appliedRule: priceData.rule,
          };
        }
        return i;
      })
    );

    // Update total
    const oldTotal = item.totalPrice;
    setSaleTotal((prevTotal) => prevTotal - oldTotal + newTotal);
  };

  const handleCloseSaleModal = () => {
    setShowSaleModal(false);
    setSaleItems([]);
    setSaleTotal(0);
  };

  const handleBarcodeResult = async (barcode: string) => {
    try {
      if (!currentTenant?.id) return;
      const product = await findProductByBarcode(currentTenant.id, barcode);
      if (product) {
        toast({
          title: t("productFound"),
          description: `${t("found")}: ${product.name}`,
        });
        // Add to POS or handle as needed
      } else {
        toast({
          title: t("productNotFound"),
          description: `${t("noProductFoundWithBarcode")}: ${barcode}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t("error"),
        description: t("failedToSearchProduct"),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricsCard
          title={t("totalProducts")}
          value={(dashboardData as any)?.totalProducts || 0}
          change="+12%"
          changeType="positive"
          description={t("vsLastMonth")}
          icon={Package}
        />

        <MetricsCard
          title={t("lowStockItems")}
          value={(dashboardData as any)?.lowStockItems || 0}
          change="Alert"
          changeType="negative"
          description={t("needsAttention")}
          icon={AlertTriangle}
        />

        <MetricsCard
          title={t("todaysSales")}
          value={formatCurrency((dashboardData as any)?.todaysSales || 0)}
          change="+8.2%"
          changeType="positive"
          description={t("vsYesterday")}
          icon={TrendingUp}
        />

      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Quick Actions & POS */}
        <div className="xl:col-span-2 space-y-6">
          {/* Quick Actions */}
          <div className="glass-card p-6">
            <h3 className="text-base font-display font-semibold text-foreground mb-4">
              {t("quickActions")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button
                variant="ghost"
                className="quick-action flex-col h-auto py-6"
                onClick={() => setShowSaleModal(true)}
                data-testid="button-new-sale">
                <ShoppingCart className="w-8 h-8 text-text-secondary group-hover:text-accent-primary mx-auto mb-2 transition-colors" />
                <p className="text-sm font-medium text-text-secondary group-hover:text-foreground transition-colors">
                  {t("newSale")}
                </p>
              </Button>

              <Button
                variant="ghost"
                className="quick-action flex-col h-auto py-6"
                onClick={() => setShowProductModal(true)}
                data-testid="button-add-product">
                <Plus className="w-8 h-8 text-text-secondary group-hover:text-accent-primary mx-auto mb-2 transition-colors" />
                <p className="text-sm font-medium text-text-secondary group-hover:text-foreground transition-colors">
                  {t("addProduct")}
                </p>
              </Button>

              <Button
                variant="ghost"
                className="quick-action flex-col h-auto py-6"
                onClick={() => setShowStockModal(true)}
                data-testid="button-stock-entry">
                <BarChart3 className="w-8 h-8 text-text-secondary group-hover:text-accent-primary mx-auto mb-2 transition-colors" />
                <p className="text-sm font-medium text-text-secondary group-hover:text-foreground transition-colors">
                  {t("stockEntry")}
                </p>
              </Button>

              <BarcodeScanner onScanResult={handleBarcodeResult}>
                <Button
                  variant="ghost"
                  className="quick-action flex-col h-auto py-6"
                  data-testid="button-scan-item">
                  <Scan className="w-8 h-8 text-text-secondary group-hover:text-accent-primary mx-auto mb-2 transition-colors" />
                  <p className="text-sm font-medium text-text-secondary group-hover:text-foreground transition-colors">
                    {t("scanItem")}
                  </p>
                </Button>
              </BarcodeScanner>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-display font-semibold text-foreground">
                {t("recentSales")}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (window.location.href = "/reports?type=sales")}
                className="text-primary hover:bg-primary/20"
                data-testid="button-view-all-sales">
                {t("viewAll")}
              </Button>
            </div>
            <div className="space-y-3" data-testid="recent-sales">
              {(dashboardData as any)?.recentSales?.length ? (
                (dashboardData as any).recentSales.map((sale: any) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-chart-positive/20 rounded-xl flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-chart-positive" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          #{sale.saleNumber}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {new Date(sale.createdAt).toLocaleDateString()}{" "}
                          {new Date(sale.createdAt).toLocaleTimeString()}
                        </p>
                        {sale.customer && (
                          <p className="text-xs text-text-secondary">
                            {t("customer")}: {sale.customer.name}
                          </p>
                        )}
                        <p className="text-xs text-text-secondary">
                          {sale.items?.length || 0} {t("items")} •{" "}
                          {sale.paymentMethod}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold text-chart-positive">
                        +{formatCurrency(sale.total || 0)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {sale.status || "completed"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-text-secondary text-center py-4">
                  {t("noSalesToday")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Activity & Alerts */}
        <div className="space-y-6">
          {/* Low Stock Alerts */}
          <div className="glass-card p-6">
            <h3 className="text-base font-display font-semibold text-foreground mb-4">
              {t("stockAlerts")}
            </h3>
            <div className="space-y-3" data-testid="low-stock-alerts">
              {(dashboardData as any)?.lowStockAlerts?.length ? (
                (dashboardData as any).lowStockAlerts.map((item: any) => (
                  <div key={item.id} className="alert-item alert-low-stock">
                    <div>
                      <p className="font-medium text-foreground">
                        {item.product.name}
                      </p>
                      <p className="text-sm text-danger">
                        {t("only")} {item.quantity} {t("left")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger/20"
                      onClick={() => setShowStockModal(true)}
                      data-testid={`button-restock-${item.id}`}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-text-secondary text-center py-4">
                  {t("noLowStockAlerts")}
                </p>
              )}
            </div>
          </div>

          {/* System Status */}
          <div className="glass-card p-6">
            <h3 className="text-base font-display font-semibold text-foreground mb-4">
              {t("systemStatus")}
            </h3>
            <div className="space-y-3" data-testid="system-status">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-chart-positive rounded-full"></div>
                  <span className="text-sm text-foreground">
                    {t("cloudSync")}
                  </span>
                </div>
                <Badge variant="success">{t("online")}</Badge>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-chart-positive rounded-full"></div>
                  <span className="text-sm text-foreground">
                    {t("database")}
                  </span>
                </div>
                <Badge variant="success">{t("healthy")}</Badge>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Modals */}
      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
      />

      <StockEntryModal
        isOpen={showStockModal}
        onClose={() => setShowStockModal(false)}
      />

      <SaleModal
        isOpen={showSaleModal}
        onClose={handleCloseSaleModal}
        saleItems={saleItems}
        total={saleTotal}
        onAddItem={handleAddItem}
        onRemoveItem={handleRemoveItem}
        onUpdateQuantity={handleUpdateQuantity}
      />
    </div>
  );
}
