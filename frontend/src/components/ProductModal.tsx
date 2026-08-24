import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { insertProductSchema, type InsertProduct } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { useToast } from "@/hooks/use-toast";
import { showApiErrorToast } from "@/lib/errorHandler";
import { useProductLock } from "@/hooks/useProductLock";
import { getDeviceId } from "@/lib/deviceIdentity";

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: any | null; // Changed to any to accept full product with id
  initialVariants?: any[]; // Optional variants to pre-populate
}

interface VariantAttribute {
  name: string;
  value: string;
}

interface VariantData {
  id?: string; // Optional - present for existing variants
  attributes: VariantAttribute[];
  sku: string;
  price: string;
  cost: string;
  barcode: string;
  quantity: number;
  minStockAlert: number;
}

// Stable reference so callers that omit `initialVariants` (e.g. ProductDetails'
// edit modal) don't retrigger the form-reset effect below on every render.
const EMPTY_VARIANTS: any[] = [];

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  product,
  initialVariants = EMPTY_VARIANTS,
}) => {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const lock = useProductLock(currentTenant?.id, product?.id, isOpen && Boolean(product?.id));
  const isLockedOut = Boolean(product?.id) && lock.state !== "granted";
  const queryClient = useQueryClient();
  const [variants, setVariants] = useState<VariantData[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const form = useForm<InsertProduct>({
    resolver: zodResolver(insertProductSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "0.00",
      cost: "0.00",
      barcode: "",
      qrCode: "",
      categoryId: "",
      rayonId: "",
      supplierId: "",
      tenantId: currentTenant?.id,
      minStockAlert: 10,
      isActive: true,
    },
  });

  // Fetch categories (needed for dropdown of ALL available categories)
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories", currentTenant?.id],
    enabled: !!currentTenant?.id && isOpen,
  });

  // Fetch rayons (needed for dropdown of ALL available rayons)
  const { data: rayons = [] } = useQuery<any[]>({
    queryKey: ["/api/rayons", currentTenant?.id],
    enabled: !!currentTenant?.id && isOpen,
  });

  // Fetch suppliers (needed for dropdown)
  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/suppliers", currentTenant?.id],
    enabled: !!currentTenant?.id && isOpen,
  });

  // Update form when product changes (for edit mode)
  useEffect(() => {
    if (isOpen) {
      if (product?.id) {
        // Edit mode - populate with product data
        form.reset({
          name: product.name || "",
          description: product.description || "",
          price: product.price || "0.00",
          cost: product.cost || "0.00",
          barcode: product.barcode || "",
          qrCode: product.qrCode || "",
          categoryId: product.categoryId || "",
          rayonId: product.rayonId || "",
          supplierId: product.supplierId || "",
          tenantId: currentTenant?.id,
          minStockAlert: product.minStockAlert || 10,
          isActive: product.isActive ?? true,
        });
        // Load existing variants in edit mode (from populated data)
        if (product.variants && product.variants.length > 0) {
          const mappedVariants = product.variants.map((v: any) => ({
            id: v.id, // Keep the ID for updates
            attributes: v.attributes || [{ name: "Size", value: "" }],
            sku: v.sku || "",
            price: v.price?.toString() || "",
            cost: v.cost?.toString() || "",
            barcode: v.barcode || "",
            quantity: v.quantity || 0,
            minStockAlert: v.minStockAlert || 10,
          }));
          setVariants(mappedVariants);
          setShowVariants(mappedVariants.length > 0);
        } else {
          setVariants([]);
          setShowVariants(false);
        }
      } else {
        // Create mode - use defaults or pre-populated data
        form.reset({
          name: product?.name || "",
          description: product?.description || "",
          price: product?.price || "0.00",
          cost: product?.cost || "0.00",
          barcode: product?.barcode || "",
          qrCode: product?.qrCode || "",
          categoryId: product?.categoryId || "",
          rayonId: product?.rayonId || "",
          supplierId: product?.supplierId || "",
          tenantId: currentTenant?.id,
          minStockAlert: product?.minStockAlert || 10,
          isActive: product?.isActive ?? true,
        });
        // Set variants from initialVariants if provided
        if (initialVariants.length > 0) {
          const mappedVariants = initialVariants.map((v: any) => ({
            attributes: v.attributes || [{ name: "Size", value: "" }],
            sku: v.sku || "",
            price: v.price?.toString() || "",
            cost: v.cost?.toString() || "",
            barcode: v.barcode || "",
            quantity: v.quantity || 0,
            minStockAlert: v.minStockAlert || 10,
          }));
          setVariants(mappedVariants);
          setShowVariants(true);
        }
      }
    }
  }, [isOpen, product, currentTenant?.id, form, initialVariants]);

  // Create product mutation
  const createProductMutation = useMutation({
    mutationFn: async (data: InsertProduct) => {
      const response = await offlineApiRequest("POST", `/api/products`, data, {
        collection: "products",
      });
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("productSavedOfflineWillSync")
          : t("productCreatedSuccessfully"),
      });
      onClose(); // Always close modal after success
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateProduct"), t("networkRequestFailed"));
    },
  });

  // Update product mutation
  const updateProductMutation = useMutation({
    mutationFn: async (data: InsertProduct) => {
      if (!product?.id) throw new Error("Product ID is required for update");
      const response = await offlineApiRequest(
        "PUT",
        `/api/products/${product.id}`,
        data,
        { collection: "products" }
      );
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("productSavedOfflineWillSync")
          : t("productUpdatedSuccessfully"),
      });
      onClose(); // Always close modal after success
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateProduct"), t("networkRequestFailed"));
    },
  });

  const onSubmit = async (data: InsertProduct) => {
    if (isLockedOut) {
      toast({
        title: t("error"),
        description: t("lockNotGranted"),
        variant: "destructive",
      });
      return;
    }

    if (!currentTenant?.id) {
      toast({
        title: t("error"),
        description: t("noTenantSelected"),
        variant: "destructive",
      });
      return;
    }

    const formData = {
      ...data,
      tenantId: currentTenant.id,
      // Convert string prices to numbers for backend validation
      price:
        typeof data.price === "string" ? parseFloat(data.price) : data.price,
      cost: typeof data.cost === "string" ? parseFloat(data.cost) : data.cost,
      // Convert empty categoryId to undefined
      categoryId:
        data.categoryId && data.categoryId !== "" ? data.categoryId : undefined,
      // Convert an empty rayon selection to an explicit null so the backend
      // clears the assignment - unlike categoryId above, `undefined` would be
      // dropped by JSON.stringify and the backend would just preserve the
      // product's current rayonId instead of clearing it (see Task 1, Step 6d).
      rayonId:
        data.rayonId && data.rayonId !== "" ? data.rayonId : null,
      // Convert empty supplierId to undefined
      supplierId:
        data.supplierId && data.supplierId !== "" ? data.supplierId : undefined,
      // Lets the backend verify this device actually holds the edit lock
      // before accepting the write.
      ...(product?.id ? { deviceId: getDeviceId() } : {}),
    } as any; // Cast to any since backend expects numbers but schema has strings

    if (product?.id) {
      // Edit mode - update the product only
      setIsCreating(true);
      try {
        const response = await offlineApiRequest(
          "PUT",
          `/api/products/${product.id}`,
          formData,
          { collection: "products", entityId: product.id }
        );
        const result = await response.json();

        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        toast({
          title: result?._savedOffline ? t("savedOffline") : t("success"),
          description: result?._savedOffline
            ? t("productSavedOfflineWillSync")
            : t("productUpdatedSuccessfully"),
        });
        handleClose();
      } catch (error: any) {
        void showApiErrorToast(toast, error, t("error"), t("failedToUpdateProduct"), t("networkRequestFailed"));
      } finally {
        setIsCreating(false);
      }
    } else {
      // Create mode - create product then variants if any
      setIsCreating(true);
      try {
        // A client UUID lets dependent variant operations keep a valid URL
        // even when both product and variants are queued offline.
        const requestedProductId = crypto.randomUUID();
        const response = await offlineApiRequest(
          "POST",
          "/api/products",
          { ...formData, id: requestedProductId },
          { collection: "products", entityId: requestedProductId }
        );
        const createdProduct = await response.json();
        let savedOffline = createdProduct?._savedOffline === true;

        // Create variants if any
        if (variants.length > 0) {
          for (const variant of variants) {
            const variantResponse = await offlineApiRequest(
              "POST",
              `/api/products/${createdProduct.id || requestedProductId}/variants`,
              {
                ...variant,
                productId: createdProduct.id || requestedProductId,
                tenantId: currentTenant.id,
                isActive: true,
                // Ensure numeric fields are properly converted
                price: variant.price
                  ? typeof variant.price === "string"
                    ? parseFloat(variant.price)
                    : variant.price
                  : undefined,
                cost: variant.cost
                  ? typeof variant.cost === "string"
                    ? parseFloat(variant.cost)
                    : variant.cost
                  : undefined,
                quantity:
                  typeof variant.quantity === "string"
                    ? parseInt(variant.quantity)
                    : variant.quantity,
                // minStockAlert omitted: backend sets from parent product
              },
              { collection: "products" }
            );
            const variantResult = await variantResponse.json();
            savedOffline ||= variantResult?._savedOffline === true;
          }
        }

        // Success
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        toast({
          title: savedOffline ? t("savedOffline") : t("success"),
          description: savedOffline
            ? t("productSavedOfflineWillSync")
            : variants.length > 0
              ? `${t("product")} ${t("and")} ${variants.length} ${t(
                  "variantsCreatedSuccessfully"
                )}`
              : t("productCreatedSuccessfully"),
        });
        handleClose();
      } catch (error: any) {
        void showApiErrorToast(toast, error, t("error"), t("failedToCreateProduct"), t("networkRequestFailed"));
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleClose = () => {
    form.reset();
    setVariants([]);
    setShowVariants(false);
    onClose();
  };

  const addVariant = () => {
    setVariants([
      ...variants,
      {
        attributes: [{ name: "Size", value: "" }],
        sku: "",
        price: "",
        cost: "",
        barcode: "",
        quantity: 0,
        minStockAlert: 10,
      },
    ]);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (
    index: number,
    field: keyof VariantData,
    value: any
  ) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const addAttribute = (variantIndex: number) => {
    const updated = [...variants];
    updated[variantIndex].attributes.push({ name: "Color", value: "" });
    setVariants(updated);
  };

  const removeAttribute = (variantIndex: number, attrIndex: number) => {
    const updated = [...variants];
    updated[variantIndex].attributes = updated[variantIndex].attributes.filter(
      (_, i) => i !== attrIndex
    );
    setVariants(updated);
  };

  const updateAttribute = (
    variantIndex: number,
    attrIndex: number,
    field: "name" | "value",
    value: string
  ) => {
    const updated = [...variants];
    updated[variantIndex].attributes[attrIndex][field] = value;
    setVariants(updated);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="product-modal">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {product?.id ? t("editProduct") : t("createProduct")}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-close-modal">
              <X className="w-6 h-6" />
            </Button>
          </div>
        </DialogHeader>

        {isLockedOut && (
          <Alert
            className="mb-4 border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
            data-testid="product-lock-banner">
            <AlertDescription>
              {(lock.state === "checking" || lock.state === "idle") && t("lockChecking")}
              {lock.state === "requesting" &&
                `${t("lockRequesting")} ${lock.holderName ?? ""}...`}
              {lock.state === "refused" && (
                <>
                  {t("lockRefused")} {lock.holderName ?? ""}.{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 underline text-yellow-700 dark:text-yellow-400"
                    onClick={lock.retry}
                    data-testid="button-retry-lock">
                    {t("lockRetry")}
                  </Button>
                </>
              )}
              {lock.state === "timeout" && (
                <>
                  {t("lockTimeout")}{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 underline text-yellow-700 dark:text-yellow-400"
                    onClick={lock.retry}
                    data-testid="button-retry-lock">
                    {t("lockRetry")}
                  </Button>
                </>
              )}
              {lock.state === "unreachable" && (
                <>
                  {t("lockUnreachable")} {lock.holderName ?? ""}.{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 underline text-yellow-700 dark:text-yellow-400"
                    onClick={lock.retry}
                    data-testid="button-retry-lock">
                    {t("lockRetry")}
                  </Button>
                </>
              )}
              {lock.state === "error" && (
                <>
                  {t("lockError")}{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 underline text-yellow-700 dark:text-yellow-400"
                    onClick={lock.retry}
                    data-testid="button-retry-lock">
                    {t("lockRetry")}
                  </Button>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          data-testid="form-product">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="name"
                className="text-sm font-medium text-foreground">
                {t("productName")}
              </Label>
              <Input
                id="name"
                {...form.register("name")}
                className="glass-input rounded-xl"
                placeholder={t("enterProductName")}
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
                htmlFor="price"
                className="text-sm font-medium text-foreground">
                {t("price")}
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                {...form.register("price")}
                className="glass-input rounded-xl"
                placeholder="0.00"
                data-testid="input-price"
              />
              {form.formState.errors.price && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.price.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="cost"
                className="text-sm font-medium text-foreground">
                {t("cost")}
              </Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                {...form.register("cost")}
                className="glass-input rounded-xl"
                placeholder="0.00"
                data-testid="input-cost"
              />
              {form.formState.errors.cost && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.cost.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="categoryId"
                className="text-sm font-medium text-foreground">
                {t("category")} ({t("optional")})
              </Label>
              <Select
                value={form.watch("categoryId") || "none"}
                onValueChange={(value) =>
                  form.setValue("categoryId", value === "none" ? "" : value)
                }>
                <SelectTrigger
                  className="glass-input rounded-xl"
                  data-testid="select-category">
                  <SelectValue placeholder={t("selectCategory")} />
                </SelectTrigger>
                <SelectContent className="glass-card border-border">
                  <SelectItem value="none">{t("noCategory")}</SelectItem>
                  {categories.map((category: any) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.categoryId && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.categoryId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="rayonId"
                className="text-sm font-medium text-foreground">
                {t("rayon")} ({t("optional")})
              </Label>
              <Select
                value={form.watch("rayonId") || "none"}
                onValueChange={(value) =>
                  form.setValue("rayonId", value === "none" ? "" : value)
                }>
                <SelectTrigger
                  className="glass-input rounded-xl"
                  data-testid="select-rayon">
                  <SelectValue placeholder={t("selectRayon")} />
                </SelectTrigger>
                <SelectContent className="glass-card border-border">
                  <SelectItem value="none">{t("noRayon")}</SelectItem>
                  {rayons.map((rayon: any) => (
                    <SelectItem key={rayon.id} value={rayon.id}>
                      {rayon.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.rayonId && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.rayonId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="supplierId"
                className="text-sm font-medium text-foreground">
                {t("supplier")} ({t("optional")})
              </Label>
              <Select
                value={form.watch("supplierId") || "none"}
                onValueChange={(value) =>
                  form.setValue("supplierId", value === "none" ? "" : value)
                }>
                <SelectTrigger
                  className="glass-input rounded-xl"
                  data-testid="select-supplier">
                  <SelectValue placeholder={t("selectSupplier")} />
                </SelectTrigger>
                <SelectContent className="glass-card border-border">
                  <SelectItem value="none">{t("noSupplier")}</SelectItem>
                  {suppliers.map((supplier: any) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.supplierId && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.supplierId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="minStockAlert"
                className="text-sm font-medium text-foreground">
                {t("minStockAlert")}
              </Label>
              <Input
                id="minStockAlert"
                type="number"
                {...form.register("minStockAlert", { valueAsNumber: true })}
                className="glass-input rounded-xl"
                placeholder="10"
                data-testid="input-min-stock"
              />
              {form.formState.errors.minStockAlert && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.minStockAlert.message}
                </p>
              )}
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label
                htmlFor="barcode"
                className="text-sm font-medium text-foreground">
                {t("barcode")}
              </Label>
              <Input
                id="barcode"
                {...form.register("barcode")}
                className="glass-input rounded-xl"
                placeholder={t("scanOrEnterManually")}
                data-testid="input-barcode"
              />
              {form.formState.errors.barcode && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.barcode.message}
                </p>
              )}
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label
                htmlFor="description"
                className="text-sm font-medium text-foreground">
                {t("description")}
              </Label>
              <Input
                id="description"
                {...form.register("description")}
                className="glass-input rounded-xl"
                placeholder={t("productDescription")}
                data-testid="input-description"
              />
            </div>
          </div>

          {/* Variants Section - Only show when creating a new product */}
          {!product?.id && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowVariants(!showVariants)}
                  className="text-foreground hover:text-accent-primary">
                  {showVariants ? (
                    <ChevronUp className="w-4 h-4 mr-2" />
                  ) : (
                    <ChevronDown className="w-4 h-4 mr-2" />
                  )}
                  {t("variants")}{" "}
                  {variants.length > 0 && `(${variants.length})`}
                </Button>
                {showVariants && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addVariant}>
                    <Plus className="w-4 h-4 mr-1" />
                    {t("addVariant")}
                  </Button>
                )}
              </div>

              {showVariants && (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {variants.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t("noVariantsForProduct")}
                    </p>
                  ) : (
                    variants.map((variant, variantIdx) => (
                      <div
                        key={variantIdx}
                        className="glass-input p-4 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">
                            {t("variant")} {variantIdx + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeVariant(variantIdx)}
                            className="text-danger hover:bg-danger/20">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Attributes */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                              {t("variantAttributes")}
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => addAttribute(variantIdx)}
                              className="text-xs h-6">
                              <Plus className="w-3 h-3 mr-1" />
                              {t("addAttribute")}
                            </Button>
                          </div>
                          {variant.attributes.map((attr, attrIdx) => (
                            <div key={attrIdx} className="flex gap-2">
                              <Select
                                value={attr.name}
                                onValueChange={(value) =>
                                  updateAttribute(
                                    variantIdx,
                                    attrIdx,
                                    "name",
                                    value
                                  )
                                }>
                                <SelectTrigger className="glass-input flex-1">
                                  <SelectValue />
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
                              <Input
                                value={attr.value}
                                onChange={(e) =>
                                  updateAttribute(
                                    variantIdx,
                                    attrIdx,
                                    "value",
                                    e.target.value
                                  )
                                }
                                className="glass-input flex-1"
                                placeholder={t("attributeValue")}
                              />
                              {variant.attributes.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    removeAttribute(variantIdx, attrIdx)
                                  }>
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Variant Fields */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">{t("sku")}</Label>
                            <Input
                              value={variant.sku}
                              onChange={(e) =>
                                updateVariant(variantIdx, "sku", e.target.value)
                              }
                              className="glass-input text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t("barcode")}</Label>
                            <Input
                              value={variant.barcode}
                              onChange={(e) =>
                                updateVariant(
                                  variantIdx,
                                  "barcode",
                                  e.target.value
                                )
                              }
                              className="glass-input text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t("price")}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={variant.price}
                              onChange={(e) =>
                                updateVariant(
                                  variantIdx,
                                  "price",
                                  e.target.value
                                )
                              }
                              className="glass-input text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t("cost")}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={variant.cost}
                              onChange={(e) =>
                                updateVariant(
                                  variantIdx,
                                  "cost",
                                  e.target.value
                                )
                              }
                              className="glass-input text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

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
              disabled={
                createProductMutation.isPending ||
                updateProductMutation.isPending ||
                isCreating ||
                isLockedOut
              }
              data-testid="button-save-product">
              {createProductMutation.isPending ||
              updateProductMutation.isPending ||
              isCreating
                ? t("saving")
                : product?.id
                ? t("update")
                : t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
