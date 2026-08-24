import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Package, Info, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { useToast } from "@/hooks/use-toast";
import { showApiErrorToast } from "@/lib/errorHandler";
import { useNumberFormat } from "../hooks/useNumberFormat";

const stockEntrySchema = z.object({
  productId: z.string().min(1, "Product is required"),
  variantId: z.string().optional(),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  reason: z.string().optional(),
});

type StockEntryForm = z.infer<typeof stockEntrySchema>;

interface StockEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: "entry" | "exit";
  preselectedProductId?: string;
  preselectedVariantId?: string;
}

export const StockEntryModal: React.FC<StockEntryModalProps> = ({
  isOpen,
  onClose,
  mode = "entry",
  preselectedProductId,
  preselectedVariantId,
}) => {
  const { t } = useTranslation();

  // Define schema inside component to access translations
  const stockEntrySchema = z.object({
    productId: z.string().min(1, t("productIsRequired")),
    variantId: z.string().optional(),
    quantity: z.number().min(1, t("quantityMustBeAtLeast1")),
    reason: z.string().optional(),
  });

  type StockEntryForm = z.infer<typeof stockEntrySchema>;
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useNumberFormat();

  const form = useForm<StockEntryForm>({
    resolver: zodResolver(stockEntrySchema),
    defaultValues: {
      productId: preselectedProductId || "",
      variantId: "",
      quantity: 1,
      reason: "",
    },
  });

  // Update form when preselectedProductId changes
  useEffect(() => {
    if (preselectedProductId) {
      form.setValue("productId", preselectedProductId);
    }
  }, [preselectedProductId, form]);

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products", currentTenant?.id],
    enabled: !!currentTenant?.id && isOpen,
  });

  // Fetch variants for the selected product
  const selectedProductId = form.watch("productId");
  const { data: variants = [] } = useQuery({
    queryKey: [`/api/products/${selectedProductId}/variants`],
    enabled: !!selectedProductId && isOpen,
  });

  // Update form when preselectedVariantId changes
  useEffect(() => {
    if (preselectedVariantId && (variants as any[]).length > 0) {
      form.setValue("variantId", preselectedVariantId);
    }
  }, [preselectedVariantId, variants, form]);

  // Reset variantId when product changes (unless we have a preselected variant)
  useEffect(() => {
    if (!preselectedVariantId) {
      form.setValue("variantId", "");
    }
  }, [selectedProductId, preselectedVariantId, form]);

  const hasVariants = (variants as any[]).length > 0;

  // Stock transaction mutation (entry or exit)
  const stockEntryMutation = useMutation({
    mutationFn: async (data: StockEntryForm) => {
      const endpoint = mode === "entry" ? "entry" : "exit";

      const quantity = Number(data.quantity);
      const requestData = {
        quantity: Number.isFinite(quantity) && quantity >= 1 ? quantity : 1,
        ...(data.reason?.trim() && { reason: data.reason.trim() }),
        userId: user?.id,
        tenantId: currentTenant?.id,
        productId: data.productId,
        ...(data.variantId && { variantId: data.variantId }),
      };

      // Determine the API path based on whether a variant is selected
      const path = data.variantId
        ? `/api/stock/variant/${data.variantId}/${endpoint}`
        : `/api/stock/${data.productId}/${endpoint}`;

      const collection = mode === "entry" ? "stock_entry" : "stock_exit";
      const response = await offlineApiRequest("POST", path, requestData, {
        collection,
      });
      return response.json();
    },
    onSuccess: (result, variables) => {
      const isOffline = result?._savedOffline === true;

      // Invalidate all relevant queries to refresh data across the app
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      // Also invalidate the specific product's variants if a variant was involved
      if (variables.variantId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/products/${variables.productId}/variants`],
        });
      }

      const message =
        mode === "entry"
          ? t("stockAddedSuccessfully")
          : t("stockRemovedSuccessfully");

      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("stockTransactionSavedOfflineWillSync")
          : message,
        variant: "success",
      });

      onClose(); // Always close modal after success
    },
    onError: (error: any) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateStock"), t("networkRequestFailed"));
    },
  });

  const onSubmit = (data: StockEntryForm) => {
    if (!user?.id || !currentTenant?.id) {
      toast({
        title: t("error"),
        description: !currentTenant?.id ? t("pleaseSelectTenant") : t("failedToUpdateStock"),
        variant: "destructive",
      });
      return;
    }
    // Validate that if product has variants, a variant must be selected
    if (hasVariants && !data.variantId) {
      toast({
        title: t("error"),
        description: t("pleaseSelectVariant"),
        variant: "destructive",
      });
      return;
    }

    stockEntryMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const selectedProduct = (products as any[]).find(
    (p: any) => p.id === form.watch("productId")
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="glass-card max-w-lg max-h-[90vh] overflow-y-auto"
        data-testid="stock-entry-modal">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {mode === "entry" ? t("stockEntry") : t("stockExit")}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label={t("close")}
              data-testid="button-close-modal">
              <X className="w-6 h-6" />
            </Button>
          </div>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          data-testid="form-stock-entry">
          <div className="space-y-2">
            <Label
              htmlFor="productId"
              className="text-sm font-medium text-foreground">
              {t("product")}
            </Label>
            <Select
              value={form.watch("productId")}
              onValueChange={(value) => form.setValue("productId", value)}>
              <SelectTrigger
                className="glass-input rounded-xl"
                data-testid="select-product">
                <SelectValue placeholder={t("selectProduct")} />
              </SelectTrigger>
              <SelectContent className="glass-card border-border max-h-48">
                {(products as any[]).map((product: any) => (
                  <SelectItem key={product.id} value={product.id}>
                    <div className="flex items-center space-x-2">
                      <Package className="w-4 h-4" />
                      <span>{product.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(product.price)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.productId && (
              <p className="text-sm text-destructive">
                {form.formState.errors.productId.message}
              </p>
            )}
          </div>

          {selectedProduct && hasVariants && (
            <div className="space-y-3">
              {/* Info Alert */}
              <div className="p-3 glass-input rounded-xl bg-info/10 border border-info/30">
                <div className="flex items-start space-x-2">
                  <Info className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground flex-1">
                    {t("productHasVariantsInfo")}
                  </p>
                </div>
              </div>

              {/* Variant Selector */}
              <div className="space-y-2">
                <Label
                  htmlFor="variantId"
                  className="text-sm font-medium text-foreground flex items-center space-x-1">
                  <span>{t("selectVariant")}</span>
                  <span className="text-chart-2">*</span>
                </Label>
                <Select
                  value={form.watch("variantId") || undefined}
                  onValueChange={(value) => form.setValue("variantId", value)}>
                  <SelectTrigger
                    className="glass-input rounded-xl h-auto min-h-[2.5rem]"
                    data-testid="select-variant">
                    <SelectValue placeholder={t("selectVariant")}>
                      {form.watch("variantId") &&
                        (() => {
                          const selectedVariant = (variants as any[]).find(
                            (v: any) => v.id === form.watch("variantId")
                          );
                          if (selectedVariant) {
                            const attributesText = selectedVariant.attributes
                              .map((attr: any) => `${attr.name}: ${attr.value}`)
                              .join(", ");
                            return (
                              <div className="flex items-center justify-between w-full pr-2">
                                <span className="font-medium">
                                  {attributesText}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {t("stock")}: {selectedVariant.quantity || 0}
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="glass-card border-border max-h-[300px]">
                    {(variants as any[]).map((variant: any) => {
                      // Format attributes for display
                      const attributesText = variant.attributes
                        .map((attr: any) => `${attr.name}: ${attr.value}`)
                        .join(", ");

                      // Determine stock status
                      const quantity = variant.quantity || 0;
                      const isLowStock = quantity <= variant.minStockAlert;
                      const isOutOfStock = quantity === 0;

                      return (
                        <SelectItem
                          key={variant.id}
                          value={variant.id}
                          className="py-3">
                          <div className="flex items-start justify-between w-full space-x-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-foreground mb-1">
                                {attributesText}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                {variant.sku && (
                                  <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                    SKU: {variant.sku}
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded font-medium ${
                                    isOutOfStock
                                      ? "bg-danger/10 text-danger"
                                      : isLowStock
                                      ? "bg-warning/10 text-warning"
                                      : "bg-success/10 text-success"
                                  }`}>
                                  {t("stock")}: {quantity}
                                </span>
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {form.formState.errors.variantId && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.variantId.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {hasVariants && !form.watch("variantId") && (
            <div className="p-3 glass-input rounded-xl bg-warning/10 border border-warning/30">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                <p className="text-sm text-foreground">
                  {t("pleaseSelectVariant")}
                </p>
              </div>
            </div>
          )}

          {selectedProduct && !hasVariants && (
            <div className="p-3 glass-input rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {selectedProduct.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(selectedProduct.price)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label
              htmlFor="quantity"
              className="text-sm font-medium text-foreground">
              {mode === "entry" ? t("quantityToAdd") : t("quantityToRemove")}
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              {...form.register("quantity", { valueAsNumber: true })}
              className="glass-input rounded-xl"
              placeholder="1"
              data-testid="input-quantity"
            />
            {form.formState.errors.quantity && (
              <p className="text-sm text-destructive">
                {form.formState.errors.quantity.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="reason"
              className="text-sm font-medium text-foreground">
              {t("reasonOptional")}
            </Label>
            <Input
              id="reason"
              {...form.register("reason")}
              className="glass-input rounded-xl"
              placeholder={
                mode === "entry"
                  ? t("stockReplenishment")
                  : t("stockAdjustmentReason")
              }
              data-testid="input-reason"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              data-testid="button-cancel">
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={stockEntryMutation.isPending}
              data-testid={
                mode === "entry" ? "button-add-stock" : "button-remove-stock"
              }>
              {stockEntryMutation.isPending
                ? mode === "entry"
                  ? t("adding")
                  : t("removing")
                : mode === "entry"
                ? t("addStock")
                : t("removeStock")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
