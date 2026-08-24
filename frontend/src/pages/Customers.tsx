import React, { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit,
  User,
  Phone,
  Mail,
  MapPin,
  Trash2,
  ShoppingCart,
  Eye,
  X,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { insertCustomerSchema, type InsertCustomer } from "@shared/schema";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { getCachedResponse, listCacheKeyFor } from "@/lib/offlineCache";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { usePolicy } from "@/hooks/usePolicy";
import { CustomersPolicy } from "@/lib/policies/customers.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { useOfflineDeleteMutation } from "@/hooks/useOfflineDeleteMutation";
import { showApiErrorToast } from "@/lib/errorHandler";

export default function Customers() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useNumberFormat();
  const customersPolicy = usePolicy(CustomersPolicy);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPurchaseHistory, setShowPurchaseHistory] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showSaleDetails, setShowSaleDetails] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);

  const form = useForm<InsertCustomer>({
    resolver: zodResolver(insertCustomerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      address: "",
      tenantId: currentTenant?.id || "",
    },
  });

  // Fetch customers
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["/api/customers", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  // customer.totalPurchases is never maintained as a running total (by
  // design - see SalesService.create's test coverage: a sale never writes
  // back to the customer record). The real total is the sum of that
  // customer's sales, so the list column needs the sales list to derive it
  // from, same as the purchase-history modal does with its own query below.
  const { data: sales = [] } = useQuery<any[]>({
    queryKey: ["/api/sales", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const purchasesTotalByCustomer = useMemo(() => {
    const totals = new Map<string, number>();
    for (const sale of sales) {
      if (!sale.customerId) continue;
      totals.set(
        sale.customerId,
        (totals.get(sale.customerId) ?? 0) + parseFloat(sale.total || "0")
      );
    }
    return totals;
  }, [sales]);

  // Create/Update customer mutation
  const saveCustomerMutation = useMutation({
    mutationFn: async (data: InsertCustomer) => {
      const method = editingCustomer ? "PUT" : "POST";
      const url = editingCustomer
        ? `/api/customers/${editingCustomer.id}`
        : "/api/customers";
      const response = await offlineApiRequest(
        method,
        url,
        {
          ...data,
          tenantId: currentTenant?.id,
        },
        { collection: "customers" }
      );
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("customerSavedOffline")
          : editingCustomer
          ? t("customerUpdatedSuccessfully")
          : t("customerCreatedSuccessfully"),
      });
      handleCloseModal(); // Always close modal after success
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveCustomer"), t("networkRequestFailed"));
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useOfflineDeleteMutation({
    collection: "customers",
    queryKey: ["/api/customers"],
    entityUrl: (customerId) => `/api/customers/${customerId}`,
    messages: {
      online: t("customerDeletedSuccessfully"),
      queued: t("customerDeleteQueuedOffline"),
      error: t("failedToDeleteCustomer"),
      successTitle: t("success"),
      queuedTitle: t("savedOffline"),
      errorTitle: t("error"),
      networkError: t("networkRequestFailed"),
    },
  });

  const handleCloseModal = () => {
    setShowCustomerModal(false);
    setEditingCustomer(null);
    form.reset({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      address: "",
      tenantId: currentTenant?.id || "",
    });
  };

  const handleEditCustomer = (customer: any) => {
    setEditingCustomer(customer);
    form.reset({
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      tenantId: customer.tenantId,
    });
    setShowCustomerModal(true);
  };

  const onSubmit = (data: InsertCustomer) => {
    saveCustomerMutation.mutate(data);
  };

  const handleDeleteCustomer = (customer: any) => {
    if (
      window.confirm(
        `${t("confirmDeleteCustomer")} ${customer.firstName} ${
          customer.lastName
        }?`
      )
    ) {
      deleteCustomerMutation.mutate(customer.id);
    }
  };

  const handleViewPurchases = (customer: any) => {
    setSelectedCustomer(customer);
    setShowPurchaseHistory(true);
  };

  const handleViewSaleDetails = (sale: any) => {
    setSelectedSale(sale);
    setShowSaleDetails(true);
  };

  // Fetch customer purchases
  const { data: customerPurchases = [], isLoading: isPurchasesLoading } =
    useQuery({
      queryKey: ["/api/customers", selectedCustomer?.id, "purchases"],
      queryFn: async () => {
        try {
          const response = await offlineApiRequest(
            "GET",
            `/api/customers/${selectedCustomer?.id}/purchases`,
            undefined,
            { collection: "customers" }
          );
          return await response.json();
        } catch (error) {
          // A customer's purchases are just their sales, server-side
          // (CustomersService delegates to SalesRepository.findByCustomer) -
          // there's no separate "purchases" list to write to or seed
          // offline, but the sales list is already correctly cached, so
          // derive it from there instead of showing empty forever.
          const sales = (await getCachedResponse(
            listCacheKeyFor("sales", currentTenant?.id ?? null),
            "sales"
          )) as Array<{ customerId?: string | null }> | null;
          if (!sales) throw error;
          return sales.filter(
            (sale) => sale.customerId === selectedCustomer?.id
          );
        }
      },
      enabled: !!selectedCustomer?.id,
    });

  const filteredCustomers = (customers as any[]).filter((customer: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${customer.firstName} ${customer.lastName}`.toLowerCase();
    return (
      fullName.includes(query) ||
      customer.phone?.includes(query) ||
      customer.email?.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="customers-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("customers")}
        </h1>
        <Button
          onClick={() => {
            setEditingCustomer(null);
            setShowCustomerModal(true);
          }}
          data-testid="button-add-customer">
          <Plus className="w-4 h-4 mr-2" />
          {t("addCustomer")}
        </Button>
      </div>

      {/* Search */}
      <div className="glass-card rounded-xl p-6">
        <div className="relative">
          <Input
            placeholder={t("searchCustomersByNamePhoneEmail")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input rounded-xl pl-10"
            data-testid="input-search-customers"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Customers Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-foreground">{t("customer")}</TableHead>
              <TableHead className="text-foreground">{t("contact")}</TableHead>
              <TableHead className="text-foreground">{t("address")}</TableHead>
              <TableHead className="text-foreground">
                {t("totalPurchases")}
              </TableHead>
              <TableHead className="text-foreground">{t("joined")}</TableHead>
              <TableHead className="text-foreground text-right">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="flex flex-col items-center space-y-2">
                    <User className="w-12 h-12 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? t("noCustomersMatchSearch")
                        : t("noCustomersFound")}
                    </p>
                    {!searchQuery && (
                      <Button
                        variant="outline"
                        onClick={() => setShowCustomerModal(true)}
                        className="mt-2">
                        <Plus className="w-4 h-4 mr-2" />
                        {t("addYourFirstCustomer")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer: any) => (
                <TableRow
                  key={customer.id}
                  className="border-border"
                  data-testid={`customer-row-${customer.id}`}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-primary to-chart-5 rounded-xl flex items-center justify-center">
                        <span className="text-primary-foreground font-semibold text-sm">
                          {customer.firstName[0]}
                          {customer.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {customer.firstName} {customer.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          ID: {customer.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {customer.phone && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          <span className="text-foreground">
                            {customer.phone}
                          </span>
                        </div>
                      )}
                      {customer.email && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Mail className="w-3 h-3 text-muted-foreground" />
                          <span className="text-foreground">
                            {customer.email}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {customer.address && (
                      <div className="flex items-center space-x-2 text-sm">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {customer.address}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-foreground">
                      {formatCurrency(
                        purchasesTotalByCustomer.get(customer.id) ?? 0
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground text-sm">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center space-x-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewPurchases(customer)}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid={`button-view-purchases-${customer.id}`}
                        title={t("viewPurchaseHistory")}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditCustomer(customer)}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid={`button-edit-${customer.id}`}
                        title={t("editCustomer")}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <PolicyGuard policy={CustomersPolicy} action="canDelete">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteCustomer(customer)}
                          className="text-muted-foreground hover:text-red-500"
                          data-testid={`button-delete-${customer.id}`}
                          title={t("deleteCustomer")}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </PolicyGuard>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Customer Modal */}
      <Dialog open={showCustomerModal} onOpenChange={handleCloseModal}>
        <DialogContent
          className="glass-card max-w-lg max-h-[90vh] overflow-y-auto"
          data-testid="customer-modal">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">
              {editingCustomer ? t("editCustomer") : t("addNewCustomer")}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-customer">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="firstName"
                  className="text-sm font-medium text-foreground">
                  {t("firstName")}
                </Label>
                <Input
                  id="firstName"
                  {...form.register("firstName")}
                  className="glass-input rounded-xl"
                  placeholder="John"
                  data-testid="input-first-name"
                />
                {form.formState.errors.firstName && (
                  <p className="text-sm text-chart-2">
                    {form.formState.errors.firstName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="lastName"
                  className="text-sm font-medium text-foreground">
                  {t("lastName")}
                </Label>
                <Input
                  id="lastName"
                  {...form.register("lastName")}
                  className="glass-input rounded-xl"
                  placeholder="Doe"
                  data-testid="input-last-name"
                />
                {form.formState.errors.lastName && (
                  <p className="text-sm text-chart-2">
                    {form.formState.errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="phone"
                className="text-sm font-medium text-foreground">
                {t("phone")}
              </Label>
              <Input
                id="phone"
                {...form.register("phone")}
                className="glass-input rounded-xl"
                placeholder="+33 1 23 45 67 89"
                data-testid="input-phone"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-foreground">
                {t("email")}
              </Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                className="glass-input rounded-xl"
                placeholder="john.doe@example.com"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="address"
                className="text-sm font-medium text-foreground">
                {t("address")}
              </Label>
              <Input
                id="address"
                {...form.register("address")}
                className="glass-input rounded-xl"
                placeholder="123 Main Street, City"
                data-testid="input-address"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                data-testid="button-cancel">
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={saveCustomerMutation.isPending}
                data-testid="button-save-customer">
                {saveCustomerMutation.isPending
                  ? t("loading")
                  : t("saveCustomer")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Purchase History Modal */}
      <Dialog
        open={showPurchaseHistory}
        onOpenChange={(open) => {
          if (!open) {
            setShowPurchaseHistory(false);
            setSelectedCustomer(null);
          }
        }}>
        <DialogContent
          className="glass-card max-w-4xl max-h-[90vh] overflow-y-auto"
          data-testid="purchase-history-modal">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              {t("purchaseHistory")} - {selectedCustomer?.firstName}{" "}
              {selectedCustomer?.lastName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {isPurchasesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : customerPurchases.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="w-12 h-12 text-muted-foreground opacity-50 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {t("noPurchaseHistoryFound")}
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {customerPurchases.map((purchase: any) => (
                  <div
                    key={purchase.id}
                    className="glass-card rounded-lg p-4"
                    data-testid={`purchase-${purchase.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-foreground">
                          {t("sale")} #{purchase.saleNumber}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(purchase.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-lg font-semibold text-foreground">
                          {formatCurrency(parseFloat(purchase.total))}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {purchase.paymentMethod}
                        </p>
                      </div>
                    </div>
                    {purchase.notes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {t("notes")}: {purchase.notes}
                      </p>
                    )}
                    <div className="flex justify-end mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewSaleDetails(purchase)}
                        data-testid={`button-view-sale-${purchase.id}`}>
                        <Eye className="w-4 h-4 mr-1" />
                        {t("viewDetails")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                {t("totalPurchases")}:{" "}
                {formatCurrency(
                  customerPurchases.reduce(
                    (sum: number, purchase: any) =>
                      sum + parseFloat(purchase.total || "0"),
                    0
                  )
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => setShowPurchaseHistory(false)}
                data-testid="button-close-history">
                {t("close")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sale Details Modal */}
      <Dialog open={showSaleDetails} onOpenChange={setShowSaleDetails}>
        <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
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
                      {new Date(selectedSale.createdAt).toLocaleString()}
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
                  {t("productInSale")}
                </h4>
                <div className="space-y-3">
                  {(selectedSale.items ?? []).map((item: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium text-foreground">
                          {item.product?.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity} x {formatCurrency(parseFloat(item.unitPrice))}
                        </p>
                      </div>
                      <p className="font-mono font-semibold text-foreground">
                        {formatCurrency(parseFloat(item.totalPrice))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-border">
                <span className="text-muted-foreground">{t("total")}</span>
                <span className="font-mono text-lg font-semibold text-foreground">
                  {formatCurrency(parseFloat(selectedSale.total))}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
