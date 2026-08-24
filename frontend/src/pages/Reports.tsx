import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  Download,
  TrendingUp,
  DollarSign,
  Package,
  FileText,
  Eye,
  User,
  X,
  BarChart3,
  ShoppingCart,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { useSettings } from "../hooks/useSettings";
import { format } from "date-fns";

interface SaleWithItems {
  id: string;
  saleNumber: string;
  customerId?: string;
  customer?: { id: string; name: string; email?: string };
  items: Array<{
    id: string;
    productId: string;
    product: { id: string; name: string; price?: string; cost?: string };
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  profit?: string | number;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

export default function Reports() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { formatCurrency } = useNumberFormat();
  const {
    getCurrencyFormat,
    getDefaultCurrency,
    getSetting,
    getCompanyName,
    getCompanyPhone,
    getCompanyEmail,
    getCompanyAddress,
  } = useSettings();
  const [reportPeriod, setReportPeriod] = useState("today");
  const [reportType, setReportType] = useState("sales");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [selectedSale, setSelectedSale] = useState<SaleWithItems | null>(null);
  const [showSaleDetails, setShowSaleDetails] = useState(false);

  // Sync from URL params (?type=sales, ?productId=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const productIdParam = params.get("productId");
    if (type === "sales") setReportType("sales");
    if (productIdParam) setProductFilter(productIdParam);
  }, []);

  // Calculate date range based on period
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
      case "quarter":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
    }

    return { startDate, endDate: now };
  };

  const { startDate, endDate } = useMemo(
    () => getDateRange(reportPeriod),
    [reportPeriod]
  );

  // Fetch sales data (report API with date range)
  const { data: salesReport = [] } = useQuery({
    queryKey: [
      "/api/sales",
      currentTenant?.id,
      "report",
      startDate.toISOString(),
      endDate.toISOString(),
    ],
    enabled: !!currentTenant?.id && reportType === "sales",
  });

  // Fetch products for product filter (sales report only)
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products", currentTenant?.id],
    enabled: !!currentTenant?.id && reportType === "sales",
  });

  // Filter sales by product when product filter is set
  const salesFiltered = useMemo(() => {
    const sales = (salesReport as SaleWithItems[]) || [];
    if (productFilter === "all") return sales;
    return sales.filter((sale) =>
      sale.items?.some((item: any) => item.product?.id === productFilter)
    );
  }, [salesReport, productFilter]);

  // Sales stats from filtered sales (units sold, revenue, profit, profit margin)
  const salesStats = useMemo(() => {
    const sales = salesFiltered as SaleWithItems[];
    const unitsSold = sales.reduce(
      (sum, sale) =>
        sum +
        (sale.items?.reduce((q: number, item: any) => q + (item.quantity || 0), 0) || 0),
      0
    );
    const revenue = sales.reduce(
      (sum, sale) => sum + parseFloat(String(sale.total || 0)),
      0
    );
    const profit = sales.reduce(
      (sum, sale) => sum + parseFloat(String(sale.profit || 0)),
      0
    );
    return { unitsSold, revenue, profit, cost: revenue - profit };
  }, [salesFiltered]);


  // Fetch dashboard metrics for summary (other report types)
  const { data: dashboardData } = useQuery({
    queryKey: ["/api/dashboard", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const handleExportReport = () => {
    console.log("Exporting report...", {
      reportType,
      reportPeriod,
      startDate,
      endDate,
    });
  };

  const handleViewSaleDetails = (sale: SaleWithItems) => {
    setSelectedSale(sale);
    setShowSaleDetails(true);
  };

  const handleCloseSaleDetails = () => {
    setSelectedSale(null);
    setShowSaleDetails(false);
  };

  const handleDownloadInvoice = async (sale: SaleWithItems) => {
    try {
      const companyInfo = {
        name: getCompanyName() || "Retail Store",
        phone: getCompanyPhone(),
        email: getCompanyEmail(),
        address: getCompanyAddress(),
      };
      const receiptData = {
        sale: sale as any,
        companyInfo,
        customer: sale.customer as any,
        staff: user as any,
        items: sale.items.map((item: any) => ({
          id: item.id,
          saleId: sale.id,
          productId: item.product?.id,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice ?? 0),
          totalPrice: String(item.totalPrice ?? 0),
          product: item.product,
          priceType: item.priceType,
          variant: item.variant,
          pricing: item.pricing,
        })),
        formatOptions: {
          currency: getDefaultCurrency(),
          ...getCurrencyFormat(),
        },
      };
      const receiptFormat = getSetting("receiptFormat", "retail");
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

  const calculateSummaryMetrics = () => {
    const totalSales = (salesReport as any[]).reduce(
      (sum: number, sale: any) => sum + parseFloat(sale.total),
      0
    );
    const totalTransactions = (salesReport as any[]).length;
    const averageTransaction =
      totalTransactions > 0 ? totalSales / totalTransactions : 0;
    return {
      totalSales,
      totalTransactions,
      averageTransaction,
    };
  };

  const summaryMetrics = calculateSummaryMetrics();

  const reportTypes = [
    { value: "sales", label: t("salesReport") },
    { value: "inventory", label: t("inventoryReport") },
    { value: "customers", label: t("customerReport") },
    { value: "staff", label: t("staffPerformance") },
  ];

  const periods = [
    { value: "today", label: t("today") },
    { value: "week", label: t("last7Days") },
    { value: "month", label: t("last30Days") },
    { value: "quarter", label: t("last3Months") },
    { value: "year", label: t("last1Year") },
  ];

  return (
    <div className="space-y-6" data-testid="reports-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("reports")}
        </h1>
        <Button
          onClick={handleExportReport}
          data-testid="button-export-report">
          <Download className="w-4 h-4 mr-2" />
          {t("exportReport")}
        </Button>
      </div>

      {/* Report Controls */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger
                className="w-48 glass-input"
                data-testid="select-report-type">
                <SelectValue placeholder={t("selectReportType")} />
              </SelectTrigger>
              <SelectContent className="glass-card border-border">
                {reportTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={reportPeriod} onValueChange={setReportPeriod}>
              <SelectTrigger
                className="w-48 glass-input"
                data-testid="select-report-period">
                <SelectValue placeholder={t("selectPeriod")} />
              </SelectTrigger>
              <SelectContent className="glass-card border-border">
                {periods.map((period) => (
                  <SelectItem key={period.value} value={period.value}>
                    {period.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reportType === "sales" && (
            <div className="flex items-center space-x-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              <Select
                value={productFilter}
                onValueChange={setProductFilter}>
                <SelectTrigger
                  className="w-48 glass-input"
                  data-testid="select-report-product">
                <SelectValue placeholder={t("filterByProduct")} />
                </SelectTrigger>
                <SelectContent className="glass-card border-border">
                  <SelectItem value="all">{t("allProducts")}</SelectItem>
                  {(products as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {reportType === "sales" && (
            <Button
              variant="outline"
              className="glass-input"
              onClick={() => (window.location.href = "/?openSaleModal=1")}
              data-testid="button-new-sale-reports">
              <ShoppingCart className="w-4 h-4 mr-2" />
              {t("newSale")}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards - different for sales report vs others */}
      {reportType === "sales" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{t("unitsSold")}</p>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold text-foreground">
              {salesStats.unitsSold.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("totalQuantitySold")}
            </p>
          </div>
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{t("revenue")}</p>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatCurrency(salesStats.revenue)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("totalSalesValue")}
            </p>
          </div>
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{t("profit")}</p>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p
              className={`text-xl font-bold ${
                salesStats.profit >= 0 ? "text-chart-positive" : "text-chart-negative"
              }`}>
              {salesStats.profit >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(salesStats.profit))}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("netProfitEarned")}
            </p>
          </div>
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">
                {t("totalCost")}
              </p>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatCurrency(salesStats.cost)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("costOfGoodsSold")}
            </p>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="glass-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalSales")}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground">
              {formatCurrency(summaryMetrics.totalSales)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("forSelectedPeriod")}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("transactions")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground">
              {summaryMetrics.totalTransactions}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("completedSales")}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("avgTransaction")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground">
              {formatCurrency(summaryMetrics.averageTransaction)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("perTransaction")}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("productsSold")}
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground">
              {(dashboardData as any)?.totalProducts || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("uniqueProducts")}
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Report Content */}
      {reportType === "sales" && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="text-base font-semibold text-foreground">
              {t("allSales")} ({salesFiltered.length})
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
                    {t("items")}
                  </TableHead>
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
                {salesFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex flex-col items-center space-y-2">
                        <FileText className="w-12 h-12 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">
                          {t("noSalesDataForPeriod")}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  salesFiltered.map((sale: SaleWithItems) => (
                    <TableRow key={sale.id} className="border-border hover:bg-muted/50">
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
                        <div className="flex items-center space-x-2">
                          <Package className="w-4 h-4" />
                          <span>
                            {sale.items?.length || 0} {t("items")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-foreground">
                        {formatCurrency(parseFloat(String(sale.total || 0)))}
                      </TableCell>
                      <TableCell
                        className={`font-mono font-semibold ${
                          parseFloat(String(sale.profit || 0)) >= 0
                            ? "text-chart-positive"
                            : "text-chart-negative"
                        }`}>
                        {parseFloat(String(sale.profit || 0)) >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(parseFloat(String(sale.profit || 0))))}
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
                            className="text-yellow-600 hover:bg-yellow-500/20">
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
      )}

      {/* Sale Details Modal */}
      <Dialog
        open={showSaleDetails}
        onOpenChange={(open) => {
          setShowSaleDetails(open);
          if (!open) setSelectedSale(null);
        }}>
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
                  onClick={handleCloseSaleDetails}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-close-sale-details">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-6">
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
                      <span className="font-mono">#{selectedSale.saleNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("date")}:</span>
                      <span>
                        {format(
                          new Date(selectedSale.createdAt),
                          "dd/MM/yyyy HH:mm"
                        )}
                      </span>
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
              <div className="glass-card p-4">
                <h4 className="font-semibold text-foreground mb-3">
                  {t("itemsSold")}
                </h4>
                <div className="space-y-2">
                  {selectedSale.items?.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex justify-between text-sm py-2 border-b border-border last:border-0">
                      <span className="text-foreground">
                        {item.product?.name}
                        {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                      </span>
                      <span className="font-mono">
                        {formatCurrency(
                          parseFloat(String(item.totalPrice || item.unitPrice * item.quantity)))
                        }
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-semibold text-foreground mt-4 pt-4 border-t border-border">
                  <span>{t("total")}</span>
                  <span className="font-mono">
                    {formatCurrency(parseFloat(String(selectedSale.total)))}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {reportType === "inventory" && (
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-base font-semibold text-foreground mb-4">
            {t("inventoryReport")}
          </h3>
        </div>
      )}

      {reportType === "customers" && (
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-base font-semibold text-foreground mb-4">
            {t("customerReport")}
          </h3>
        </div>
      )}

      {reportType === "staff" && (
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-base font-semibold text-foreground mb-4">
            {t("staffPerformance")}
          </h3>
        </div>
      )}
    </div>
  );
}
