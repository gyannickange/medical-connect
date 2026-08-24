import React, { useState } from "react";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Download,
  Eye,
  Calendar,
  CreditCard,
  Banknote,
  Smartphone,
  User,
  Package,
  TrendingUp,
  DollarSign,
  CircleDollarSign,
  X,
  BarChart3,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useSettings } from "../hooks/useSettings";

interface Sale {
  id: string;
  saleNumber: string;
  qrCode?: string;
  customerId?: string;
  customer?: {
    id: string;
    name: string;
    email?: string;
  };
  items: Array<{
    id: string;
    product: {
      id: string;
      name: string;
      price: string;
      cost: string;
    };
    variant?: {
      id: string;
      attributes: Array<{ name: string; value: string }>;
    };
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    priceType?: string;
    pricing?: {
      id: string;
      priceType: string;
      minQuantity?: number;
      maxQuantity?: number;
    };
  }>;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  profit: string | number;
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

export const Sales: React.FC = () => {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { formatCurrency } = useNumberFormat();

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
  const {
    getCurrencyFormat,
    getDefaultCurrency,
    getSetting,
    getCompanyName,
    getCompanyPhone,
    getCompanyEmail,
    getCompanyAddress,
  } = useSettings();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [dateRange, setDateRange] = useState("7d"); // Analytics date range
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showSaleDetails, setShowSaleDetails] = useState(false);

  // Fetch analytics data
  const { data: analytics = [], isLoading: analyticsLoading } = useQuery<
    AnalyticsData[]
  >({
    queryKey: ["/api/sales/analytics", currentTenant?.id, dateRange],
    queryFn: async () => {
      const response = await offlineApiRequest(
        "GET",
        `/api/sales/analytics/${currentTenant?.id}?dateRange=${dateRange}`,
        undefined,
        { collection: "sales" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  // Fetch all sales
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["/api/sales", currentTenant?.id],
    enabled: !!currentTenant?.id,
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
        sale.qrCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sale.customer?.name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        sale.items.some((item) =>
          item.product.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

      const matchesStatus =
        statusFilter === "all" || sale.status === statusFilter;

      const matchesPayment =
        paymentMethodFilter === "all" ||
        sale.paymentMethod === paymentMethodFilter;

      // Add date filtering
      if (dateRange) {
        const saleDate = new Date(sale.createdAt);
        if (saleDate < dateRange) return false;
      }

      return matchesSearch && matchesStatus && matchesPayment;
    });

    // Sort by creation date (newest first)
    return filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [sales, searchQuery, statusFilter, paymentMethodFilter, dateFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedSales = filteredSales.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, paymentMethodFilter, dateFilter]);

  const handleViewSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowSaleDetails(true);
  };

  const handleCloseSaleDetails = () => {
    setSelectedSale(null);
    setShowSaleDetails(false);
  };

  const handleDownloadInvoice = async (sale: Sale) => {
    try {
      // Get company info from settings
      const companyInfo = {
        name: getCompanyName() || "Retail Store",
        phone: getCompanyPhone(),
        email: getCompanyEmail(),
        address: getCompanyAddress(),
      };

      // Prepare receipt/invoice data
      const receiptData = {
        sale: sale as any,
        companyInfo: companyInfo,
        customer: sale.customer as any,
        staff: user as any,
        items: sale.items.map((item) => ({
          id: item.id,
          saleId: sale.id,
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.totalPrice.toString(),
          product: item.product,
          priceType: (item as any).priceType,
          variant: (item as any).variant,
          pricing: (item as any).pricing,
        })),
        formatOptions: {
          currency: getDefaultCurrency(),
          ...getCurrencyFormat(),
        },
      };

      // Check receipt format setting (default to "retail")
      const receiptFormat = getSetting("receiptFormat", "retail");

      // Generate appropriate receipt/invoice based on setting
      if (receiptFormat === "retail") {
        const { generateRetailReceiptPDF } = await import(
          "@/utils/receiptGenerator"
        );
        await generateRetailReceiptPDF(receiptData as any);
      } else {
        const { generateInvoicePDF } = await import("@/utils/pdfGenerator");
        await generateInvoicePDF(receiptData as any);
      }
    } catch (error) {
      console.error("Failed to generate receipt:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      completed: { variant: "success", label: t("completed") },
      pending: { variant: "warning", label: t("pending") },
      cancelled: { variant: "danger", label: t("cancelled") },
    } as const;

    const config = statusConfig[status as keyof typeof statusConfig] || {
      variant: "secondary" as const,
      label: status,
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "cash":
        return <Banknote className="w-4 h-4" />;
      case "card":
        return <CreditCard className="w-4 h-4" />;
      case "mobile":
        return <Smartphone className="w-4 h-4" />;
      default:
        return <CreditCard className="w-4 h-4" />;
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "Sale #",
      "Date",
      "Customer",
      "Items",
      "Payment",
      "Status",
      "Total",
    ];
    const rows = filteredSales.map((sale) => [
      sale.saleNumber,
      format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm"),
      sale.customer?.name || "No Customer",
      sale.items.length,
      sale.paymentMethod,
      sale.status,
      String(sale.total),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales_export_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="space-y-6" data-testid="sales-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("sales")}
        </h1>
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            className="glass-input rounded-xl"
            onClick={handleExportCSV}
            data-testid="button-export-sales">
            <Download className="w-4 h-4 mr-2" />
            {t("export")}
          </Button>
        </div>
      </div>

      {/* Analytics Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-display font-semibold text-foreground">
            {t("salesAnalytics") || "Sales Analytics"}
          </h3>
        </div>
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
            {t("totalQuantitySold") || "Total quantity sold"}
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-text-secondary">{t("revenue")}</p>
            <DollarSign className="h-4 w-4 text-text-secondary" />
          </div>
          <p className="text-xl font-bold text-foreground">
            {formatCurrency(analyticsTotals.revenue)}
          </p>
          <p className="text-xs text-text-secondary">
            {t("totalSalesValue") || "Total sales value"}
          </p>
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
            {formatCurrency(Math.abs(analyticsTotals.profit))}
          </p>
          <p className="text-xs text-text-secondary">
            {t("netProfitEarned") || "Net profit earned"}
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-text-secondary">{t("totalCost")}</p>
            <BarChart3 className="h-4 w-4 text-text-secondary" />
          </div>
          <p className="text-xl font-bold text-foreground">
            {formatCurrency(analyticsTotals.cost)}
          </p>
          <p className="text-xs text-text-secondary">
            {t("costOfGoodsSold")}
          </p>
        </div>
      </div>

      {/* Sales Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">
            {t("allSales")} ({filteredSales.length})
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
                <TableHead className="text-foreground">{t("items")}</TableHead>
                {/* <TableHead className="text-foreground">
                  {t("paymentMethod")}
                </TableHead>
                <TableHead className="text-foreground">{t("status")}</TableHead> */}
                <TableHead className="text-foreground">{t("total")}</TableHead>
                <TableHead className="text-foreground">
                  {t("totalProfit")}
                </TableHead>
                <TableHead className="text-foreground">
                  {t("actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <div className="text-center">
                      <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground text-lg mb-2">
                        {t("noSalesFound")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("noSalesFoundDescription")}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSales.map((sale) => (
                  <TableRow
                    key={sale.id}
                    className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">
                      #{sale.saleNumber}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm")}
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
                      <div className="flex items-center space-x-2">
                        <Package className="w-4 h-4" />
                        <span>
                          {sale.items.length} {t("items")}
                        </span>
                      </div>
                    </TableCell>
                    {/* <TableCell className="text-muted-foreground">
                      <div className="flex items-center space-x-2">
                        {getPaymentMethodIcon(sale.paymentMethod)}
                        <span className="capitalize">{sale.paymentMethod}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(sale.status)}</TableCell> */}
                    <TableCell className="font-mono font-semibold text-foreground">
                      {formatCurrency(sale.total)}
                    </TableCell>
                    <TableCell
                      className={`font-mono font-semibold ${
                        parseFloat(String(sale.profit || "0")) >= 0
                          ? "text-chart-positive"
                          : "text-chart-negative"
                      }`}>
                      {parseFloat(String(sale.profit || "0")) >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(parseFloat(String(sale.profit || "0"))))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewSaleDetails(sale)}
                          className="text-primary hover:bg-primary/20"
                          data-testid={`button-view-sale-${sale.id}`}>
                          <Eye className="w-4 h-4 mr-1" />
                          {t("viewDetails")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadInvoice(sale)}
                          className="text-yellow-500 hover:text-primary/80"
                          data-testid={`button-download-invoice-${sale.id}`}>
                          <Download className="w-4 h-4 mr-1" />
                          {t("receipt")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("showing")} {startIndex + 1}-
            {Math.min(startIndex + itemsPerPage, filteredSales.length)}{" "}
            {t("of")} {filteredSales.length} {t("sales")}
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
                {Array.from(
                  { length: Math.min(totalPages, 10) },
                  (_, i) => i + 1
                ).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer">
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
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
      </div>

      {/* Sale Details Modal */}
      <Dialog open={showSaleDetails} onOpenChange={setShowSaleDetails}>
        <DialogContent className="glass-card max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold text-foreground">
                {t("saleDetails")} #{selectedSale?.saleNumber}
              </DialogTitle>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-yellow-500 hover:text-primary/80"
                  onClick={() =>
                    selectedSale && handleDownloadInvoice(selectedSale)
                  }
                  data-testid="button-download-invoice-modal">
                  <Download className="w-4 h-4 mr-2" />
                  {t("downloadInvoice")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSaleDetails(false)}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-close-sale-details">
                  <X className="w-5 h-5" />
                </Button>
              </div>
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
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("status")}:
                      </span>
                      {getStatusBadge(selectedSale.status)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("paymentMethod")}:
                      </span>
                      <span className="capitalize">
                        {selectedSale.paymentMethod}
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

              {/* Sale Items */}
              <div className="glass-card p-4">
                <h4 className="font-semibold text-foreground mb-3">
                  {t("itemsSold")}
                </h4>
                <div className="space-y-3">
                  {selectedSale.items.map((item, index) => {
                    // Get pricing info from relation if available, fallback to priceType
                    const pricingInfo = (item as any).pricing;
                    const priceType =
                      pricingInfo?.priceType || (item as any).priceType;
                    const getPriceTypeBadge = (
                      priceType?: string,
                      pricingInfo?: any
                    ) => {
                      if (
                        !priceType ||
                        priceType === "auto" ||
                        priceType === "none"
                      )
                        return null;
                      const badges: Record<
                        string,
                        {
                          label: string;
                          variant:
                            | "default"
                            | "secondary"
                            | "destructive"
                            | "outline";
                        }
                      > = {
                        retail: { label: t("retail"), variant: "default" },
                        wholesale: {
                          label: t("wholesale"),
                          variant: "secondary",
                        },
                        bulk: { label: t("bulk"), variant: "secondary" },
                        promotional: {
                          label: t("promotion"),
                          variant: "destructive",
                        },
                      };
                      const badge = badges[priceType];
                      if (!badge) return null;

                      // Add quantity range info if available from pricing rule
                      let badgeText = badge.label;
                      if (
                        pricingInfo &&
                        (pricingInfo.minQuantity > 1 || pricingInfo.maxQuantity)
                      ) {
                        const range = pricingInfo.maxQuantity
                          ? `${pricingInfo.minQuantity}-${pricingInfo.maxQuantity}`
                          : `${pricingInfo.minQuantity}+`;
                        badgeText += ` (${range})`;
                      }

                      return (
                        <Badge variant={badge.variant} className="text-xs">
                          <Tag className="w-3 h-3 mr-1" />
                          {badgeText}
                        </Badge>
                      );
                    };

                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium text-foreground mb-1">
                            {item.product.name}
                          </p>
                          {/* Variant attributes and price type */}
                          <div className="flex flex-wrap gap-1 mb-1">
                            {item.variant &&
                            Array.isArray(item.variant.attributes) &&
                            item.variant.attributes.length > 0
                              ? item.variant.attributes.map(
                                  (attr: any, idx: number) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent-primary/20 text-accent-primary text-xs font-medium">
                                      {translateAttributeName(attr.name)}:{" "}
                                      {attr.value}
                                    </span>
                                  )
                                )
                              : null}
                            {getPriceTypeBadge(priceType, pricingInfo)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(item.unitPrice)} × {item.quantity}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-foreground">
                            {formatCurrency(item.totalPrice)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sale Summary */}
              <div className="glass-card p-4">
                <h4 className="font-semibold text-foreground mb-3">
                  {t("saleSummary")}
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("subtotal")}:
                    </span>
                    <span className="font-mono">
                      {formatCurrency(selectedSale.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("tax")}:</span>
                    <span className="font-mono">
                      {formatCurrency(selectedSale.tax)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold border-t border-border pt-2">
                    <span className="text-foreground">{t("total")}:</span>
                    <span className="font-mono text-primary">
                      {formatCurrency(selectedSale.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
