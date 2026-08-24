import React, { useState, useMemo } from "react";
import { useDebounce } from "use-debounce";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Package,
  PackageX,
  ArrowLeft,
  Eye,
  PackagePlus,
  TrendingUp,
  Copy,
  Download,
  PackageMinus,
  X,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ProductModal } from "../components/ProductModal";
import { ProductDetails } from "../components/ProductDetails";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { StockHistoryModal } from "../components/StockHistoryModal";
import { StockEntryModal } from "../components/StockEntryModal";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { findProductByBarcode } from "@/lib/offlineApiRequest";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { usePolicy } from "@/hooks/usePolicy";
import { ProductsPolicy } from "@/lib/policies/products.policy";
import { StockPolicy } from "@/lib/policies/stock.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { PolicyButton } from "@/components/PolicyButton";
import { filterCostFields } from "@/lib/policies/dataFilter";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineDeleteMutation } from "@/hooks/useOfflineDeleteMutation";
import { showApiErrorToast } from "@/lib/errorHandler";

export default function Products() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { formatCurrency } = useNumberFormat();
  const productsPolicy = usePolicy(ProductsPolicy);
  const stockPolicy = usePolicy(StockPolicy);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingVariants, setEditingVariants] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState<"list" | "details">("list");
  const [showStockHistoryModal, setShowStockHistoryModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [selectedProductForStock, setSelectedProductForStock] =
    useState<any>(null);
  const [stockModalMode, setStockModalMode] = useState<"entry" | "exit">(
    "entry"
  );

  const { data: productsData = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/products", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  // Filter cost fields based on user role
  const products = useMemo(() => {
    return filterCostFields(productsData, user?.role || null);
  }, [productsData, user?.role]);

  // selectedProduct is a snapshot captured at click time and never updates
  // on its own; re-derive it from the live products list on every render so
  // the details view reflects stock/price changes (e.g. a stock adjustment)
  // made after the product was selected, instead of showing stale data.
  const selectedProductLive = useMemo(() => {
    if (!selectedProduct) return selectedProduct;
    return (
      products.find((product: any) => product.id === selectedProduct.id) ??
      selectedProduct
    );
  }, [products, selectedProduct]);

  // Fetch categories for filter dropdown (still needed for complete list)
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  // Archive product mutation (soft-delete: the DELETE endpoint now archives)
  const archiveProductMutation = useOfflineDeleteMutation({
    collection: "products",
    queryKey: ["/api/products"],
    entityUrl: (productId) => `/api/products/${productId}`,
    messages: {
      online: t("productArchivedSuccessfully"),
      queued: t("productArchiveQueuedOffline"),
      error: t("failedToArchiveProduct"),
      successTitle: t("success"),
      queuedTitle: t("savedOffline"),
      errorTitle: t("error"),
      networkError: t("networkRequestFailed"),
    },
  });

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const handleArchiveProduct = (productId: string) => {
    if (confirm(t("confirmArchiveProduct"))) {
      archiveProductMutation.mutate(productId);
    }
  };

  const handleViewDetails = (product: any) => {
    setSelectedProduct(product);
    setViewMode("details");
  };

  const handleBackToList = () => {
    setSelectedProduct(null);
    setViewMode("list");
  };

  const handleViewHistory = (product: any) => {
    setSelectedProductForStock(product);
    setShowStockHistoryModal(true);
  };

  const handleAddStock = (product: any) => {
    setStockModalMode("entry");
    setSelectedProductForStock(product);
    setShowAddStockModal(true);
  };

  const handleRemoveStock = (product: any) => {
    setStockModalMode("exit");
    setSelectedProductForStock(product);
    setShowAddStockModal(true);
  };

  const handleProductUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  };

  const handleBarcodeResult = async (barcode: string) => {
    try {
      if (!currentTenant?.id) return;
      const product = await findProductByBarcode(currentTenant.id, barcode);
      if (product) {
        setSearchQuery(product.name as string);
        toast({
          title: t("productFound"),
          description: `${t("found")}: ${product.name}`,
        });
      } else {
        toast({
          title: t("productNotFound"),
          description: `${t("noProductFoundWithBarcode")}: ${barcode}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      void showApiErrorToast(toast, error, t("error"), t("failedToSearchProduct"), t("networkRequestFailed"));
    }
  };

  const handleDuplicateProduct = () => {
    if (selectedProduct) {
      const duplicatedProduct = {
        ...selectedProduct,
        id: undefined,
        name: `${selectedProduct.name} (Copy)`,
        barcode: undefined, // Clear barcode to avoid duplicates
      };
      setEditingProduct(duplicatedProduct);
      // Pass the variants to be duplicated (from populated data)
      setEditingVariants(selectedProduct.variants || []);
      setShowProductModal(true);
      // Go back to list view to show the new product when created
      handleBackToList();
    }
  };

  const handleExportProduct = () => {
    if (selectedProduct) {
      const productData = {
        ...selectedProduct,
        stockQuantity: selectedProduct.stocks?.quantity || 0,
      };
      const blob = new Blob([JSON.stringify(productData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedProduct.name.replace(/[^a-z0-9]/gi, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: t("success"),
        description: t("exportProduct"),
      });
    }
  };

  const getCategoryName = (product: any) => {
    const category = categories.find((c: any) => c.id === product.categoryId);
    return category?.name || t("uncategorized");
  };

  const getStockLevel = (product: any) => {
    // If product has variants, sum active variants' quantities, matching the
    // backend's materialized stocks.quantity (ProductsRepository.
    // planVariantAdjustment / aggregateVariantStock).
    if (product.variants && product.variants.length > 0) {
      return product.variants.reduce(
        (sum: number, variant: any) =>
          sum + (variant.isActive !== false ? variant.quantity || 0 : 0),
        0
      );
    }
    // Otherwise, use product stock quantity
    return product.stocks?.quantity || 0;
  };

  const getStockStatus = (quantity: number, minAlert: number) => {
    if (quantity === 0)
      return {
        status: t("outOfStock"),
        badge: t("empty"),
        variant: "danger" as const,
      };
    if (quantity <= minAlert)
      return {
        status: t("lowStock"),
        badge: t("low"),
        variant: "warning" as const,
      };
    return { status: t("inStock"), badge: null, variant: "success" as const };
  };

  const filteredProducts = products.filter((product: any) => {
    // Search filter (using debounced query)
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      const matchesSearch =
        product.name.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query) ||
        product.barcode?.includes(query);
      if (!matchesSearch) return false;
    }

    // Category filter
    if (categoryFilter !== "all") {
      if (product.categoryId !== categoryFilter) return false;
    }

    // Stock filter
    if (stockFilter !== "all") {
      const stockLevel = getStockLevel(product);
      const statusKey =
        stockLevel === 0
          ? "out-of-stock"
          : stockLevel <= (product.minStockAlert || 10)
          ? "low-stock"
          : "in-stock";
      if (stockFilter !== statusKey) return false;
    }

    return true;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, categoryFilter, stockFilter]);

  // Calculate inventory metrics from populated data
  const totalItems = products.reduce(
    (sum: number, product: any) => sum + getStockLevel(product),
    0
  );

  // Cost-basis inventory valuation (matches ProductDetails.tsx's
  // "Total Stock Value" and the standard accounting meaning of stock value),
  // gated behind canViewCost() below since it's derived from cost.
  const totalStockValue = products.reduce((sum: number, product: any) => {
    const stockQty = getStockLevel(product);
    if (stockQty === 0) return sum;

    // For products with variants, calculate value from each active variant
    if (product.variants && product.variants.length > 0) {
      const variantValue = product.variants.reduce(
        (variantSum: number, variant: any) => {
          if (variant.isActive === false) return variantSum;
          const variantQty = variant.quantity || 0;
          const variantCost = parseFloat(variant.cost || product.cost || 0);
          return variantSum + variantQty * variantCost;
        },
        0
      );
      return sum + variantValue;
    }

    // For products without variants, use simple calculation
    return sum + stockQty * parseFloat(product.cost || 0);
  }, 0);

  const outOfStockCount = products.filter((product: any) => {
    return getStockLevel(product) === 0;
  }).length;

  const handleOpenStockEntry = () => {
    setStockModalMode("entry");
    setSelectedProductForStock(null);
    setShowAddStockModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show product details view if a product is selected
  if (viewMode === "details" && selectedProduct) {
    return (
      <div className="space-y-6" data-testid="product-details-page">
        {/* Back button and actions */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between w-full gap-4">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={handleBackToList}>
              <ArrowLeft className="w-4 h-4" />
              {t("backToProducts")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleDuplicateProduct}
              aria-label={t("duplicateProduct")}
              className="flex items-center space-x-2">
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">{t("duplicateProduct")}</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleExportProduct}
              aria-label={t("exportProduct")}
              className="flex items-center space-x-2">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t("exportProduct")}</span>
            </Button>
            <PolicyGuard policy={ProductsPolicy} action="canDelete">
              <Button
                variant="destructive"
                onClick={() => handleArchiveProduct(selectedProduct.id)}
                aria-label={t("archiveProduct")}
                className="flex items-center space-x-2">
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t("archiveProduct")}</span>
              </Button>
            </PolicyGuard>
          </div>
        </div>

        {/* Product Details Component */}
        <ProductDetails
          product={selectedProductLive}
          variants={selectedProductLive?.variants || []}
          categories={categories}
          onProductUpdate={handleProductUpdate}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="products-page">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("products")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <PolicyGuard policy={StockPolicy} action="canEntry">
            <Button
              variant="outline"
              onClick={handleOpenStockEntry}
              data-testid="button-add-stock">
              <Plus className="w-4 h-4 mr-2" />
              {t("addStock")}
            </Button>
          </PolicyGuard>
          <PolicyGuard policy={ProductsPolicy} action="canCreate">
            <Button
              onClick={() => {
                setEditingProduct(null);
                setShowProductModal(true);
              }}
              data-testid="button-add-product">
              <Plus className="w-4 h-4 mr-2" />
              {t("addProduct")}
            </Button>
          </PolicyGuard>
        </div>
      </div>

      {/* Inventory Summary Cards */}
      <div
        className={`grid grid-cols-1 gap-6 ${
          productsPolicy.canViewCost() ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}>
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                {t("totalItems")}
              </p>
              <p className="text-lg font-mono font-bold text-foreground mt-2">
                {totalItems}
              </p>
            </div>
            <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-primary" />
            </div>
          </div>
        </div>

        {productsPolicy.canViewCost() && (
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  {t("stockValue")}
                </p>
                <p className="text-lg font-mono font-bold text-foreground mt-2">
                  {formatCurrency(totalStockValue)}
                </p>
              </div>
              <div className="w-12 h-12 bg-success/20 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
            </div>
          </div>
        )}

        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                {t("outOfStock")}
              </p>
              <p className="text-lg font-mono font-bold text-danger mt-2">
                {outOfStockCount}
              </p>
            </div>
            <div className="w-12 h-12 bg-danger/20 rounded-xl flex items-center justify-center">
              <PackageX className="w-6 h-6 text-danger" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Input
              placeholder={t("searchProductsPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input rounded-xl pl-10"
              data-testid="input-search-products"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger
              className="w-full md:w-48 glass-input"
              data-testid="select-category-filter">
              <SelectValue placeholder={t("filterByCategory")} />
            </SelectTrigger>
            <SelectContent className="glass-card border-border">
              <SelectItem value="all">{t("allCategories")}</SelectItem>
              {categories.map((category: any) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger
              className="w-full md:w-48 glass-input"
              data-testid="select-stock-filter">
              <SelectValue placeholder={t("filterByStock")} />
            </SelectTrigger>
            <SelectContent className="glass-card border-border">
              <SelectItem value="all">{t("allStock")}</SelectItem>
              <SelectItem value="in-stock">{t("inStock")}</SelectItem>
              <SelectItem value="low-stock">{t("lowStock")}</SelectItem>
              <SelectItem value="out-of-stock">{t("outOfStock")}</SelectItem>
            </SelectContent>
          </Select>

          <BarcodeScanner onScanResult={handleBarcodeResult}>
            <Button
              variant="outline"
              data-testid="button-scan-barcode">
              <Package className="w-4 h-4 mr-2" />
              {t("scanBarcode")}
            </Button>
          </BarcodeScanner>
        </div>
      </div>

      {/* Products Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-foreground font-semibold">{t("product")}</TableHead>
              <TableHead className="text-foreground font-semibold">{t("category")}</TableHead>
              <TableHead className="text-foreground font-semibold">{t("price")}</TableHead>
              {productsPolicy.canViewCost() && (
                <TableHead className="text-foreground font-semibold">{t("cost")}</TableHead>
              )}
              <TableHead className="text-foreground font-semibold">{t("stock")}</TableHead>
              <TableHead className="text-foreground font-semibold text-right">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProducts.length === 0 ? (
              <TableRow
                data-testid={
                  debouncedSearchQuery ? "product-search-empty" : undefined
                }>
                <TableCell
                  colSpan={productsPolicy.canViewCost() ? 6 : 5}
                  className="text-center py-8">
                  <div
                    className="flex flex-col items-center space-y-2"
                    role={debouncedSearchQuery ? "status" : undefined}
                    aria-label={
                      debouncedSearchQuery ? t("productSearchEmptyLabel") : undefined
                    }>
                    <Package className="w-12 h-12 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {debouncedSearchQuery
                        ? t("noProductsMatchSearch")
                        : t("noProductsFound")}
                    </p>
                    {!debouncedSearchQuery && (
                      <Button
                        variant="outline"
                        onClick={() => setShowProductModal(true)}
                        className="mt-2">
                        <Plus className="w-4 h-4 mr-2" />
                        {t("addFirstProduct")}
                      </Button>
                    )}
                    {debouncedSearchQuery && (
                      <Button
                        variant="outline"
                        onClick={() => setSearchQuery("")}
                        className="mt-2"
                        data-testid="button-clear-product-search">
                        <X className="w-4 h-4 mr-2" />
                        {t("clearSearch")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedProducts.map((product: any) => {
                const stockLevel = getStockLevel(product);
                const isLowStock = stockLevel <= (product.minStockAlert || 10);
                const stockStatus = getStockStatus(
                  stockLevel,
                  product.minStockAlert || 10
                );
                const hasVariants =
                  product.variants && product.variants.length > 0;

                return (
                  <TableRow
                    key={product.id}
                    className="border-border"
                    data-testid={`product-row-${product.id}`}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <small className="font-mono text-muted-foreground">
                            {product.barcode || ""}
                          </small>
                          <p className="font-medium text-foreground">
                            {product.name}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-muted-foreground">
                        {getCategoryName(product)}
                      </Badge>
                    </TableCell>
                    {!hasVariants && (
                      <>
                        <TableCell>
                          <span className="font-mono text-foreground">
                            {formatCurrency(parseFloat(product.price))}
                          </span>
                        </TableCell>
                        {productsPolicy.canViewCost() && (
                          <TableCell>
                            <span className="font-mono text-muted-foreground">
                              {formatCurrency(parseFloat(product.cost || "0"))}
                            </span>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center space-x-2">
                              <span
                                className={`font-mono ${
                                  stockStatus.variant === "danger"
                                    ? "text-danger"
                                    : stockStatus.variant === "warning"
                                    ? "text-warning"
                                    : "text-foreground"
                                }`}>
                                {stockLevel}
                              </span>
                              {stockStatus.badge && (
                                <Badge variant={stockStatus.variant}>
                                  {stockStatus.status}
                                </Badge>
                              )}
                            </div>
                            {/* Stock details for products without variants */}
                            {product.stocks && (
                              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground mt-1">
                                {product.stocks.reservedQuantity > 0 && (
                                  <span className="italic">
                                    {t("reserved")}:{" "}
                                    {product.stocks.reservedQuantity}
                                  </span>
                                )}
                                <span className="italic">
                                  {t("minAlert")}: {product.minStockAlert || 10}
                                </span>
                                {product.stocks.lastUpdated && (
                                  <span className="text-xs opacity-70">
                                    {t("lastUpdated")}:{" "}
                                    {new Date(
                                      product.stocks.lastUpdated
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </>
                    )}
                    {hasVariants && (
                      <>
                        <TableCell>
                          <span className="text-muted-foreground text-sm italic">
                            {t("variants")}
                          </span>
                        </TableCell>
                        {productsPolicy.canViewCost() && (
                          <TableCell>
                            <span className="text-muted-foreground text-sm italic">
                              {t("variants")}
                            </span>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span
                              className={`font-mono ${
                                stockStatus.variant === "danger"
                                  ? "text-danger"
                                  : stockStatus.variant === "warning"
                                  ? "text-warning"
                                  : "text-foreground"
                              }`}>
                              {stockLevel}
                            </span>
                            {stockStatus.badge && (
                              <Badge variant={stockStatus.variant}>
                                {stockStatus.status}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewDetails(product)}
                          aria-label={t("viewDetails")}
                          className="text-muted-foreground hover:text-foreground"
                          data-testid={`button-view-${product.id}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {product.variants && product.variants.length > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(product)}
                            data-testid={`button-manage-variants-${product.id}`}>
                            {t("manageVariants")}
                          </Button>
                        ) : (
                          <>
                            <PolicyGuard policy={StockPolicy} action="canEntry">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddStock(product)}
                                className="text-primary"
                                data-testid={`button-add-stock-${product.id}`}>
                                <PackagePlus className="w-4 h-4" /> {t("add")}
                              </Button>
                            </PolicyGuard>
                            <PolicyGuard policy={StockPolicy} action="canExit">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRemoveStock(product)}
                                className="text-danger hover:text-danger border-danger/20 hover:bg-danger/10"
                                disabled={stockLevel === 0}
                                data-testid={`button-remove-stock-${product.id}`}>
                                <PackageMinus className="w-4 h-4" />{" "}
                                {t("remove")}
                              </Button>
                            </PolicyGuard>
                          </>
                        )}
                        <PolicyGuard policy={ProductsPolicy} action="canUpdate">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditProduct(product)}
                            aria-label={t("edit")}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid={`button-edit-${product.id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </PolicyGuard>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {filteredProducts.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("showing")} {startIndex + 1}-
            {Math.min(endIndex, filteredProducts.length)} {t("of")}{" "}
            {filteredProducts.length} {t("products")}
          </p>
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    className={
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer">
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    className={
                      currentPage === totalPages
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}

      {/* Product Modal */}
      <ProductModal
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false);
          setEditingProduct(null);
          setEditingVariants([]);
        }}
        product={editingProduct}
        initialVariants={editingVariants}
      />

      {/* Stock History Modal */}
      <StockHistoryModal
        isOpen={showStockHistoryModal}
        onClose={() => {
          setShowStockHistoryModal(false);
          setSelectedProductForStock(null);
        }}
        product={selectedProductForStock}
      />

      {/* Add Stock Modal */}
      <StockEntryModal
        isOpen={showAddStockModal}
        onClose={() => {
          setShowAddStockModal(false);
          setSelectedProductForStock(null);
        }}
        mode={stockModalMode}
        preselectedProductId={selectedProductForStock?.id}
      />
    </div>
  );
}
