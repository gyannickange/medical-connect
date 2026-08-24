import React, { useState } from "react";
import {
  Plus,
  Edit,
  Trash2,
  Package,
  PackagePlus,
  PackageMinus,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StockEntryModal } from "./StockEntryModal";
import { StockHistoryModal } from "./StockHistoryModal";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  insertProductVariantSchema,
  type InsertProductVariant,
} from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "../lib/i18n";
import { showApiErrorToast } from "@/lib/errorHandler";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { usePolicy } from "@/hooks/usePolicy";
import { ProductsPolicy } from "@/lib/policies/products.policy";
import { StockPolicy } from "@/lib/policies/stock.policy";
import { PolicyGuard } from "./PolicyGuard";

interface ProductVariantsProps {
  productId: string;
  productName: string;
}

interface VariantAttribute {
  name: string;
  value: string;
}

interface VariantFormData {
  attributes: VariantAttribute[];
  sku: string;
  price: string;
  cost: string;
  barcode: string;
  quantity: number;
  minStockAlert: number;
}

export const ProductVariants: React.FC<ProductVariantsProps> = ({
  productId,
  productName,
}) => {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useNumberFormat();
  const productsPolicy = usePolicy(ProductsPolicy);
  const stockPolicy = usePolicy(StockPolicy);

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
  const [showModal, setShowModal] = useState(false);
  const [editingVariant, setEditingVariant] = useState<any>(null);

  // Stock management modals
  const [showStockEntryModal, setShowStockEntryModal] = useState(false);
  const [showStockHistoryModal, setShowStockHistoryModal] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [stockEntryType, setStockEntryType] = useState<"entry" | "exit">(
    "entry"
  );

  const form = useForm<VariantFormData>({
    defaultValues: {
      attributes: [{ name: "Size", value: "" }],
      sku: "",
      price: "0.00",
      cost: "0.00",
      barcode: "",
      quantity: 0,
      minStockAlert: 10,
    },
  });

  // Fetch product variants
  const { data: variants = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/products/${productId}/variants`],
    enabled: !!productId,
  });

  // Create variant mutation
  const createVariantMutation = useMutation({
    mutationFn: async (data: InsertProductVariant) => {
      const response = await offlineApiRequest(
        "POST",
        `/api/products/${productId}/variants`,
        data,
        {
          collection: "products",
          listKey: `/api/products/${productId}/variants`,
        }
      );
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({
        queryKey: [`/api/products/${productId}/variants`],
      });
      // Variants are embedded on the product document too - without this,
      // the products list (read by SaleModal to price/stock a sale offline)
      // stays stale until something else happens to invalidate it.
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline ? t("variantSavedOffline") : t("variantCreated"),
      });
      setShowModal(false);
      form.reset();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("variantCreateError"), t("networkRequestFailed"));
    },
  });

  // Update variant mutation
  const updateVariantMutation = useMutation({
    mutationFn: async (data: InsertProductVariant) => {
      if (!editingVariant?.id)
        throw new Error("Variant ID is required for update");
      const response = await offlineApiRequest(
        "PUT",
        `/api/products/variants/${editingVariant.id}`,
        data,
        {
          collection: "products",
          listKey: `/api/products/${productId}/variants`,
        }
      );
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({
        queryKey: [`/api/products/${productId}/variants`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline ? t("variantSavedOffline") : t("variantUpdated"),
      });
      setShowModal(false);
      setEditingVariant(null);
      form.reset();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("variantUpdateError"), t("networkRequestFailed"));
    },
  });

  // Archive variant mutation (soft-delete: the DELETE endpoint now archives)
  const archiveVariantMutation = useMutation({
    mutationFn: async (variantId: string) => {
      const response = await offlineApiRequest(
        "DELETE",
        `/api/products/variants/${variantId}`,
        undefined,
        { collection: "products", entityId: variantId }
      );
      return { _savedOffline: response.status === 202 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/products/${productId}/variants`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: t("success"),
        description: t("variantArchived"),
      });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("variantArchiveError"), t("networkRequestFailed"));
    },
  });

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

  const onSubmit = (data: VariantFormData) => {
    if (!currentTenant?.id) {
      toast({
        title: t("error"),
        description: t("noTenantSelected"),
        variant: "destructive",
      });
      return;
    }

    const variantData: InsertProductVariant = {
      ...data,
      productId,
      tenantId: currentTenant.id,
      isActive: true,
      // Ensure numeric fields are properly converted
      price: data.price
        ? typeof data.price === "string"
          ? parseFloat(data.price)
          : data.price
        : undefined,
      cost: data.cost
        ? typeof data.cost === "string"
          ? parseFloat(data.cost)
          : data.cost
        : undefined,
      quantity:
        typeof data.quantity === "string"
          ? parseInt(data.quantity)
          : data.quantity,
      // minStockAlert omitted: backend sets from parent product
    } as any;

    if (editingVariant?.id) {
      updateVariantMutation.mutate(variantData);
    } else {
      createVariantMutation.mutate(variantData);
    }
  };

  const handleEdit = (variant: any) => {
    setEditingVariant(variant);
    form.reset({
      attributes: variant.attributes || [{ name: "Size", value: "" }],
      sku: variant.sku || "",
      price: variant.price || "0.00",
      cost: variant.cost || "0.00",
      barcode: variant.barcode || "",
      quantity: variant.quantity || 0,
      minStockAlert: variant.minStockAlert || 10,
    });
    setShowModal(true);
  };

  const handleArchive = (variantId: string) => {
    if (window.confirm(t("confirmArchiveVariant"))) {
      archiveVariantMutation.mutate(variantId);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingVariant(null);
    form.reset({
      attributes: [{ name: "Size", value: "" }],
      sku: "",
      price: "0.00",
      cost: "0.00",
      barcode: "",
      quantity: 0,
      minStockAlert: 10,
    });
  };

  const handleAddStock = (variant: any) => {
    setSelectedVariant(variant);
    setStockEntryType("entry");
    setShowStockEntryModal(true);
  };

  const handleRemoveStock = (variant: any) => {
    setSelectedVariant(variant);
    setStockEntryType("exit");
    setShowStockEntryModal(true);
  };

  const handleViewHistory = (variant: any) => {
    setSelectedVariant(variant);
    setShowStockHistoryModal(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-display font-semibold text-foreground">
          {t("productVariants")}
        </h3>
        <PolicyGuard policy={ProductsPolicy} action="canCreate">
          <Button
            onClick={() => setShowModal(true)}
            data-testid="button-add-variant">
            <Plus className="w-4 h-4 mr-2" />
            {t("addVariant")}
          </Button>
        </PolicyGuard>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : variants.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Package className="w-12 h-12 text-text-secondary mx-auto mb-4" />
          <p className="text-text-secondary">{t("noVariants")}</p>
          <p className="text-text-tertiary text-sm">
            {t("noVariantsDescription")}
          </p>
        </div>
      ) : (
        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("variant")}</TableHead>
                <TableHead>{t("sku")}</TableHead>
                <TableHead>{t("price")}</TableHead>
                {productsPolicy.canViewCost() && (
                  <TableHead>{t("cost")}</TableHead>
                )}
                <TableHead>{t("stock")}</TableHead>
                <TableHead>{t("barcode")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((variant: any) => {
                const stockStatus = getStockStatus(
                  variant.quantity,
                  variant.minStockAlert || 10
                );

                return (
                  <TableRow key={variant.id}>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {variant.attributes?.map((attr: any, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-1 rounded-md bg-accent-primary/20 text-accent-primary text-sm">
                            {translateAttributeName(attr.name)}: {attr.value}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {variant.sku || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">
                        {formatCurrency(variant.price || "0.00")}
                      </span>
                    </TableCell>
                    {productsPolicy.canViewCost() && (
                      <TableCell>
                        <span className="font-semibold text-text-secondary">
                          {formatCurrency(variant.cost || "0.00")}
                        </span>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`font-mono ${
                            variant.quantity === 0
                              ? "text-chart-2"
                              : variant.quantity <=
                                (variant.minStockAlert || 10)
                              ? "text-chart-2"
                              : "text-foreground"
                          }`}>
                          {variant.quantity}
                        </span>

                        {stockStatus.badge && (
                          <Badge variant={stockStatus.variant}>
                            {stockStatus.status}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-text-secondary">
                        {variant.barcode || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewHistory(variant)}
                          title={t("viewHistory")}>
                          <History className="w-4 h-4" />
                        </Button>
                        <PolicyGuard policy={StockPolicy} action="canEntry">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddStock(variant)}
                            className="text-primary">
                            <PackagePlus className="w-4 h-4" /> {t("add")}
                          </Button>
                        </PolicyGuard>
                        <PolicyGuard policy={StockPolicy} action="canExit">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveStock(variant)}
                            className="text-danger hover:text-danger border-danger/20 hover:bg-danger/10">
                            <PackageMinus className="w-4 h-4" /> {t("remove")}
                          </Button>
                        </PolicyGuard>
                        <PolicyGuard policy={ProductsPolicy} action="canUpdate">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(variant)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </PolicyGuard>
                        <PolicyGuard policy={ProductsPolicy} action="canDelete">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleArchive(variant.id)}
                            className="text-danger hover:bg-danger/20">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </PolicyGuard>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Variant Modal */}
      <Dialog open={showModal} onOpenChange={handleClose}>
        <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-display font-semibold text-foreground">
              {editingVariant ? t("editVariant") : t("addVariant")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Attributes Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground">
                  {t("variantAttributes")}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const currentAttrs = form.getValues("attributes");
                    form.setValue("attributes", [
                      ...currentAttrs,
                      { name: "Color", value: "" },
                    ]);
                  }}
                  className="text-xs">
                  <Plus className="w-3 h-3 mr-1" />
                  {t("addAttribute")}
                </Button>
              </div>

              {form.watch("attributes")?.map((_, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Select
                      value={form.watch(`attributes.${index}.name`)}
                      onValueChange={(value) =>
                        form.setValue(`attributes.${index}.name`, value)
                      }>
                      <SelectTrigger className="glass-input">
                        <SelectValue placeholder={t("attributeName")} />
                      </SelectTrigger>
                      <SelectContent className="glass-card border-border">
                        <SelectItem value="Size">
                          {t("variantTypeSize")}
                        </SelectItem>
                        <SelectItem value="Color">
                          {t("variantTypeColor")}
                        </SelectItem>
                        <SelectItem value="Material">
                          {t("variantTypeMaterial")}
                        </SelectItem>
                        <SelectItem value="Style">
                          {t("variantTypeStyle")}
                        </SelectItem>
                        <SelectItem value="Weight">
                          {t("variantTypeWeight")}
                        </SelectItem>
                        <SelectItem value="Other">
                          {t("variantTypeOther")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Input
                      {...form.register(`attributes.${index}.value`)}
                      className="glass-input"
                      placeholder={t("attributeValue")}
                    />
                  </div>
                  {form.watch("attributes")?.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const currentAttrs = form.getValues("attributes");
                        form.setValue(
                          "attributes",
                          currentAttrs.filter((_, i) => i !== index)
                        );
                      }}
                      className="text-danger hover:bg-danger/20">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="sku"
                  className="text-sm font-medium text-foreground">
                  {t("sku")}
                </Label>
                <Input
                  id="sku"
                  {...form.register("sku")}
                  className="glass-input"
                  placeholder={t("uniqueSku")}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="price"
                  className="text-sm font-medium text-foreground">
                  {t("priceOverride")}
                </Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  {...form.register("price")}
                  className="glass-input"
                  placeholder="0.00"
                />
              </div>

              {productsPolicy.canViewCost() && (
                <div className="space-y-2">
                  <Label
                    htmlFor="cost"
                    className="text-sm font-medium text-foreground">
                    {t("costOverride")}
                  </Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    {...form.register("cost")}
                    className="glass-input"
                    placeholder="0.00"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="barcode"
                  className="text-sm font-medium text-foreground">
                  {t("barcode")}
                </Label>
                <Input
                  id="barcode"
                  {...form.register("barcode")}
                  className="glass-input"
                  placeholder={t("uniqueBarcode")}
                />
              </div>

              {editingVariant && (
                <div className="space-y-2">
                  <Label
                    htmlFor="quantity"
                    className="text-sm font-medium text-foreground">
                    {t("currentQuantity")}
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    {...form.register("quantity", { valueAsNumber: true })}
                    className="glass-input"
                    placeholder="0"
                    disabled
                    title={t("useStockEntryToModifyQuantity")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("useStockEntryToModifyQuantity")}
                  </p>
                </div>
              )}

            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  createVariantMutation.isPending ||
                  updateVariantMutation.isPending
                }>
                {createVariantMutation.isPending ||
                updateVariantMutation.isPending
                  ? t("loading")
                  : editingVariant
                  ? t("update")
                  : t("create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock Entry Modal */}
      {selectedVariant && (
        <StockEntryModal
          isOpen={showStockEntryModal}
          onClose={() => {
            setShowStockEntryModal(false);
            setSelectedVariant(null);
            // Refresh variants data after stock change
            queryClient.invalidateQueries({
              queryKey: [`/api/products/${productId}/variants`],
            });
          }}
          mode={stockEntryType}
          preselectedProductId={productId}
          preselectedVariantId={selectedVariant.id}
        />
      )}

      {/* Stock History Modal */}
      {selectedVariant && (
        <StockHistoryModal
          isOpen={showStockHistoryModal}
          onClose={() => {
            setShowStockHistoryModal(false);
            setSelectedVariant(null);
          }}
          product={
            {
              id: productId,
              name: productName,
            } as any
          }
          variantId={selectedVariant.id}
          variantName={selectedVariant.attributes
            ?.map(
              (attr: any) =>
                `${translateAttributeName(attr.name)}: ${attr.value}`
            )
            .join(", ")}
        />
      )}
    </div>
  );
};
