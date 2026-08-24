import React, { useState } from "react";
import { Plus, Search, Edit, Truck, Phone, Mail, Trash2 } from "lucide-react";
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
import {
  insertSupplierSchema,
  type InsertSupplier,
  type Supplier,
} from "@shared/schema";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { usePolicy } from "@/hooks/usePolicy";
import { SuppliersPolicy } from "@/lib/policies/suppliers.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { useOfflineDeleteMutation } from "@/hooks/useOfflineDeleteMutation";
import { showApiErrorToast } from "@/lib/errorHandler";

export default function Suppliers() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const suppliersPolicy = usePolicy(SuppliersPolicy);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const form = useForm<InsertSupplier>({
    resolver: zodResolver(insertSupplierSchema),
    defaultValues: {
      name: "",
      contactName: "",
      phone: "",
      email: "",
      tenantId: currentTenant?.id || "",
      isActive: true,
    },
  });

  // Fetch suppliers
  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const response = await offlineApiRequest(
        "GET",
        `/api/suppliers/${currentTenant.id}`,
        undefined,
        { collection: "suppliers" }
      );
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  // Create/Update supplier mutation
  const saveSupplierMutation = useMutation({
    mutationFn: async (data: InsertSupplier) => {
      const method = editingSupplier ? "PUT" : "POST";
      const url = editingSupplier
        ? `/api/suppliers/${editingSupplier.id}`
        : "/api/suppliers";
      const response = await offlineApiRequest(
        method,
        url,
        {
          ...data,
          tenantId: currentTenant?.id,
        },
        { collection: "suppliers" }
      );
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("supplierSavedOfflineWillSync")
          : editingSupplier
          ? t("supplierUpdatedSuccessfully")
          : t("supplierCreatedSuccessfully"),
      });
      handleCloseModal();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveSupplier"), t("networkRequestFailed"));
    },
  });

  // Delete supplier mutation
  const deleteSupplierMutation = useOfflineDeleteMutation({
    collection: "suppliers",
    queryKey: ["/api/suppliers"],
    entityUrl: (supplierId) => `/api/suppliers/${supplierId}`,
    messages: {
      online: t("supplierDeletedSuccessfully"),
      queued: t("supplierDeleteQueuedOffline"),
      error: t("failedToDeleteSupplier"),
      successTitle: t("success"),
      queuedTitle: t("savedOffline"),
      errorTitle: t("error"),
      networkError: t("networkRequestFailed"),
    },
  });

  const handleCloseModal = () => {
    setShowSupplierModal(false);
    setEditingSupplier(null);
    form.reset({
      name: "",
      contactName: "",
      phone: "",
      email: "",
      tenantId: currentTenant?.id || "",
      isActive: true,
    });
  };

  const handleEditSupplier = (supplier: any) => {
    setEditingSupplier(supplier);
    form.reset({
      name: supplier.name,
      contactName: supplier.contactName || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      tenantId: supplier.tenantId,
      isActive: supplier.isActive ?? true,
    });
    setShowSupplierModal(true);
  };

  const onSubmit = (data: InsertSupplier) => {
    saveSupplierMutation.mutate(data);
  };

  const handleDeleteSupplier = (supplier: any) => {
    if (window.confirm(`${t("confirmDeleteSupplier")} ${supplier.name}?`)) {
      deleteSupplierMutation.mutate(supplier.id);
    }
  };

  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      supplier.name?.toLowerCase().includes(query) ||
      supplier.contactName?.toLowerCase().includes(query) ||
      supplier.phone?.includes(query) ||
      supplier.email?.toLowerCase().includes(query)
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
    <div className="space-y-6" data-testid="suppliers-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("suppliers")}
        </h1>
        <PolicyGuard policy={SuppliersPolicy} action="canCreate">
          <Button
            onClick={() => {
              setEditingSupplier(null);
              setShowSupplierModal(true);
            }}
            data-testid="button-add-supplier">
            <Plus className="w-4 h-4 mr-2" />
            {t("addSupplier")}
          </Button>
        </PolicyGuard>
      </div>

      {/* Search */}
      <div className="glass-card rounded-xl p-6">
        <div className="relative">
          <Input
            placeholder={t("searchSuppliersPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input rounded-xl pl-10"
            data-testid="input-search-suppliers"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-foreground">{t("name")}</TableHead>
              <TableHead className="text-foreground">{t("contact")}</TableHead>
              <TableHead className="text-foreground">{t("phone")}</TableHead>
              <TableHead className="text-foreground">{t("email")}</TableHead>
              <TableHead className="text-foreground text-right">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="flex flex-col items-center space-y-2">
                    <Truck className="w-12 h-12 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? t("noSuppliersMatchSearch")
                        : t("noSuppliersFound")}
                    </p>
                    {!searchQuery && (
                      <Button
                        variant="outline"
                        onClick={() => setShowSupplierModal(true)}
                        className="mt-2">
                        <Plus className="w-4 h-4 mr-2" />
                        {t("addFirstSupplier")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredSuppliers.map((supplier) => (
                <TableRow
                  key={supplier.id}
                  className="border-border"
                  data-testid={`supplier-row-${supplier.id}`}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-primary to-chart-5 rounded-xl flex items-center justify-center">
                        <Truck className="w-5 h-5 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {supplier.name}
                        </p>
                        {supplier.contactName && (
                          <p className="text-sm text-muted-foreground">
                            {supplier.contactName}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground">
                      {supplier.contactName || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {supplier.phone ? (
                      <div className="flex items-center space-x-2 text-sm">
                        <Phone className="w-3 h-3 text-muted-foreground" />
                        <span className="text-foreground">
                          {supplier.phone}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {supplier.email ? (
                      <div className="flex items-center space-x-2 text-sm">
                        <Mail className="w-3 h-3 text-muted-foreground" />
                        <span className="text-foreground">
                          {supplier.email}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center space-x-2 justify-end">
                      <PolicyGuard policy={SuppliersPolicy} action="canUpdate">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditSupplier(supplier)}
                          className="text-muted-foreground hover:text-foreground"
                          data-testid={`button-edit-${supplier.id}`}
                          title={t("editSupplier")}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </PolicyGuard>
                      <PolicyGuard policy={SuppliersPolicy} action="canDelete">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteSupplier(supplier)}
                          className="text-muted-foreground hover:text-red-500"
                          data-testid={`button-delete-${supplier.id}`}
                          title={t("delete") + " " + t("supplier")}>
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

      {/* Supplier Modal */}
      <Dialog open={showSupplierModal} onOpenChange={handleCloseModal}>
        <DialogContent
          className="glass-card max-w-lg max-h-[90vh] overflow-y-auto"
          data-testid="supplier-modal">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">
              {editingSupplier ? t("editSupplier") : t("addNewSupplier")}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-supplier">
            <div className="space-y-2">
              <Label
                htmlFor="name"
                className="text-sm font-medium text-foreground">
                {t("supplier")} {t("name")}
              </Label>
              <Input
                id="name"
                {...form.register("name")}
                className="glass-input rounded-xl"
                placeholder={t("supplierName")}
                data-testid="input-name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="contactName"
                className="text-sm font-medium text-foreground">
                {t("contactName")}
              </Label>
              <Input
                id="contactName"
                {...form.register("contactName")}
                className="glass-input rounded-xl"
                placeholder={t("contactPersonName")}
                data-testid="input-contact-name"
              />
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
                placeholder="supplier@example.com"
                data-testid="input-email"
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
                disabled={saveSupplierMutation.isPending}
                data-testid="button-save-supplier">
                {saveSupplierMutation.isPending
                  ? t("loading")
                  : t("saveSupplier")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
