import React, { useState, useMemo } from "react";
import {
  Plus,
  Edit,
  Trash2,
  DollarSign,
  Calendar,
  Copy,
  AlertTriangle,
} from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  insertProductPricingSchema,
  type InsertProductPricing,
} from "@shared/schema";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "../lib/i18n";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { showApiErrorToast } from "@/lib/errorHandler";

interface ProductPricingProps {
  productId: string;
  productName: string;
  productPrice?: string;
  variants?: any[];
}

interface PricingFormData {
  priceType: "retail" | "wholesale" | "bulk" | "promotional";
  price: string;
  minQuantity: number;
  maxQuantity?: number;
  validFrom?: string;
  validTo?: string;
  variantId?: string;
}

export const ProductPricing: React.FC<ProductPricingProps> = ({
  productId,
  productName,
  productPrice = "0.00",
  variants = [],
}) => {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useNumberFormat();
  const [showModal, setShowModal] = useState(false);
  const [editingPricing, setEditingPricing] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pricingToDelete, setPricingToDelete] = useState<string | null>(null);
  const [conflictWarnings, setConflictWarnings] = useState<string[]>([]);

  // Fetch pricing rules - MUST be defined before validatePricingRules
  const { data: pricingRules = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/products/pricing", productId],
    queryFn: async () => {
      const response = await offlineApiRequest(
        "GET",
        `/api/products/pricing/${productId}`,
        undefined,
        { collection: "products" }
      );
      return response.json();
    },
    enabled: !!productId,
  });

  const form = useForm<PricingFormData>({
    resolver: zodResolver(
      insertProductPricingSchema
        .pick({
          priceType: true,
          price: true,
          minQuantity: true,
          maxQuantity: true,
          validFrom: true,
          validTo: true,
          variantId: true,
        })
        .extend({
          maxQuantity: z.preprocess((val) => {
            if (val === "" || val === null || val === undefined) {
              return undefined;
            }
            if (typeof val === "string") {
              const num = Number(val);
              return isNaN(num) ? undefined : num;
            }
            return val;
          }, z.number().min(1).optional().nullable()),
          validFrom: z.preprocess((val) => {
            if (
              !val ||
              (typeof val === "string" && val.trim() === "") ||
              val === null ||
              val === undefined
            ) {
              return undefined;
            }
            return val;
          }, z.string().optional().nullable()),
          validTo: z.preprocess((val) => {
            if (
              !val ||
              (typeof val === "string" && val.trim() === "") ||
              val === null ||
              val === undefined
            ) {
              return undefined;
            }
            return val;
          }, z.string().optional().nullable()),
          variantId: z.preprocess((val) => {
            if (
              !val ||
              (typeof val === "string" && val.trim() === "") ||
              val === null ||
              val === undefined
            ) {
              return undefined;
            }
            return val;
          }, z.string().optional().nullable()),
        })
        .refine(
          (data) => {
            if (
              data.maxQuantity !== undefined &&
              data.maxQuantity !== null &&
              data.minQuantity !== undefined &&
              data.maxQuantity < data.minQuantity
            ) {
              return false;
            }
            return true;
          },
          {
            message:
              "Maximum quantity must be greater than or equal to minimum quantity",
            path: ["maxQuantity"],
          }
        )
        .refine(
          (data) => {
            if (data.validFrom && data.validTo) {
              return new Date(data.validTo) >= new Date(data.validFrom);
            }
            return true;
          },
          {
            message:
              "Valid To date must be greater than or equal to Valid From date",
            path: ["validTo"],
          }
        )
    ),
    defaultValues: {
      priceType: "retail",
      price: "0.00",
      minQuantity: 1,
      maxQuantity: undefined,
      validFrom: undefined,
      validTo: undefined,
      variantId: undefined,
    },
  });

  // Validate pricing rules for conflicts
  const validatePricingRules = useMemo(() => {
    return (newRule: PricingFormData, excludeId?: string): string[] => {
      const warnings: string[] = [];
      const newMin = newRule.minQuantity;
      const newMax = newRule.maxQuantity || Infinity;
      const newFrom = newRule.validFrom ? new Date(newRule.validFrom) : null;
      const newTo = newRule.validTo ? new Date(newRule.validTo) : null;
      const newVariantId = newRule.variantId || null;

      pricingRules.forEach((rule: any) => {
        if (excludeId && rule.id === excludeId) return;

        // Check if same price type
        if (rule.priceType === newRule.priceType) {
          const ruleMin = rule.minQuantity;
          const ruleMax = rule.maxQuantity || Infinity;
          const ruleFrom = rule.validFrom ? new Date(rule.validFrom) : null;
          const ruleTo = rule.validTo ? new Date(rule.validTo) : null;
          const ruleVariantId = rule.variantId || null;

          // Check variant match (same variant or both null)
          const variantMatches =
            newVariantId === ruleVariantId ||
            (newVariantId === null && ruleVariantId === null);

          if (variantMatches) {
            // Check quantity range overlap
            const quantityOverlaps = !(newMax < ruleMin || newMin > ruleMax);

            // Check date range overlap
            const dateOverlaps =
              (!newTo || !ruleFrom || newTo >= ruleFrom) &&
              (!newFrom || !ruleTo || newFrom <= ruleTo);

            if (quantityOverlaps && dateOverlaps) {
              warnings.push(
                `Conflicting rule: ${rule.priceType} for quantity ${ruleMin}-${
                  ruleMax === Infinity ? "∞" : ruleMax
                }`
              );
            }
          }
        }
      });

      return warnings;
    };
  }, [pricingRules]);

  // Create pricing mutation
  const createPricingMutation = useMutation({
    mutationFn: async (data: InsertProductPricing) => {
      const response = await offlineApiRequest(
        "POST",
        `/api/products/${productId}/pricing`,
        data,
        {
          collection: "products",
          // The GET reads from /api/products/pricing/:id, a different path
          // than this POST's own URL - listKey must match the *read* shape.
          listKey: `/api/products/pricing/${productId}`,
        }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/products/pricing", productId],
      });
      // The product's own cached copy (read by SaleModal to price a sale
      // offline) embeds pricingRules too - without this, a rule shows up
      // here but a sale started from already-loaded product data won't see
      // it until something else happens to invalidate the products list.
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: t("success"),
        description: t("pricingRuleCreated"),
      });
      setShowModal(false);
      form.reset();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreatePricingRule"), t("networkRequestFailed"));
    },
  });

  // Update pricing mutation
  const updatePricingMutation = useMutation({
    mutationFn: async (data: InsertProductPricing) => {
      if (!editingPricing?.id)
        throw new Error("Pricing ID is required for update");
      const response = await offlineApiRequest(
        "PUT",
        `/api/products/pricing/${editingPricing.id}`,
        data,
        {
          collection: "products",
          entityId: editingPricing.id,
          listKey: `/api/products/pricing/${productId}`,
        }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/products/pricing", productId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: t("success"),
        description: t("pricingRuleUpdated"),
      });
      setShowModal(false);
      setEditingPricing(null);
      form.reset();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdatePricingRule"), t("networkRequestFailed"));
    },
  });

  // Delete pricing mutation
  const deletePricingMutation = useMutation({
    mutationFn: async (pricingId: string) => {
      return offlineApiRequest(
        "DELETE",
        `/api/products/pricing/${pricingId}`,
        undefined,
        { collection: "products", entityId: pricingId }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/products/pricing", productId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: t("success"),
        description: t("pricingRuleDeleted"),
      });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToDeletePricingRule"), t("networkRequestFailed"));
    },
  });

  const onSubmit = (data: PricingFormData) => {
    // Validate for conflicts
    const warnings = validatePricingRules(data, editingPricing?.id);
    if (warnings.length > 0) {
      setConflictWarnings(warnings);
      // Show warning but allow submission
      toast({
        title: t("warning") || "Warning",
        description: warnings.join(". "),
        variant: "destructive",
      });
    } else {
      setConflictWarnings([]);
    }

    // Transform data for API (dates need to be Date objects)
    const pricingData: InsertProductPricing = {
      ...data,
      productId,
      tenantId: currentTenant?.id || "",
      isActive: true,
      // Zod already transforms empty values to undefined, just convert dates
      validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
      validTo: data.validTo ? new Date(data.validTo) : undefined,
    };

    if (editingPricing?.id) {
      updatePricingMutation.mutate(pricingData);
    } else {
      createPricingMutation.mutate(pricingData);
    }
  };

  // Error handler for form validation
  const onError = (errors: any) => {
    console.error("Form validation errors:", errors);
    toast({
      title: t("error") || "Error",
      description:
        t("pleaseFixErrors") ||
        "Please fix the errors in the form before submitting",
      variant: "destructive",
    });
  };

  const handleEdit = (pricing: any) => {
    setEditingPricing(pricing);
    form.reset({
      priceType: pricing.priceType,
      price: pricing.price,
      minQuantity: pricing.minQuantity,
      maxQuantity: pricing.maxQuantity,
      validFrom: pricing.validFrom
        ? new Date(pricing.validFrom).toISOString().split("T")[0]
        : undefined,
      validTo: pricing.validTo
        ? new Date(pricing.validTo).toISOString().split("T")[0]
        : undefined,
      variantId: pricing.variantId,
    });
    setShowModal(true);
  };

  const handleDelete = (pricingId: string) => {
    setPricingToDelete(pricingId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (pricingToDelete) {
      deletePricingMutation.mutate(pricingToDelete);
      setDeleteDialogOpen(false);
      setPricingToDelete(null);
    }
  };

  const handleDuplicate = (pricing: any) => {
    setEditingPricing(null);
    form.reset({
      priceType: pricing.priceType,
      price: pricing.price,
      minQuantity: pricing.minQuantity,
      maxQuantity: pricing.maxQuantity,
      validFrom: pricing.validFrom
        ? new Date(pricing.validFrom).toISOString().split("T")[0]
        : undefined,
      validTo: pricing.validTo
        ? new Date(pricing.validTo).toISOString().split("T")[0]
        : undefined,
      variantId: pricing.variantId,
    });
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingPricing(null);
    form.reset();
  };

  const getPriceTypeBadge = (
    priceType: string
  ): { label: string; variant: "success" | "secondary" | "danger" } => {
    const badges: Record<
      string,
      { label: string; variant: "success" | "secondary" | "danger" }
    > = {
      retail: { label: t("retail"), variant: "success" },
      wholesale: { label: t("wholesale"), variant: "secondary" },
      bulk: { label: t("bulk"), variant: "secondary" },
      promotional: { label: t("promotion"), variant: "danger" },
    };
    return (
      badges[priceType] || {
        label: priceType,
        variant: "secondary",
      }
    );
  };

  const isActive = (pricing: any) => {
    const now = new Date();
    return (
      pricing.isActive &&
      (!pricing.validFrom || new Date(pricing.validFrom) <= now) &&
      (!pricing.validTo || new Date(pricing.validTo) >= now)
    );
  };

  const getVariantDisplay = (variantId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return null;

    // Return variant with attributes for rendering
    return variant;
  };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-display font-semibold text-foreground">
          {t("pricingRules")}
        </h3>
        <Button
          onClick={() => setShowModal(true)}
          data-testid="button-add-pricing">
          <Plus className="w-4 h-4 mr-2" />
          {t("addPricingRule")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : pricingRules.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <DollarSign className="w-12 h-12 text-text-secondary mx-auto mb-4" />
          <p className="text-text-secondary">{t("noPricingRules")}</p>
          <p className="text-text-tertiary text-sm">
            {t("noPricingRulesDescription")}
          </p>
        </div>
      ) : (
        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("type")}</TableHead>
                <TableHead>{t("price")}</TableHead>
                <TableHead>{t("quantityRange")}</TableHead>
                <TableHead>{t("variant")}</TableHead>
                <TableHead>{t("validPeriod")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricingRules.map((pricing: any) => {
                const badge = getPriceTypeBadge(pricing.priceType);
                const active = isActive(pricing);

                return (
                  <TableRow key={pricing.id}>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(pricing.price)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {pricing.minQuantity}
                        {pricing.maxQuantity
                          ? ` - ${pricing.maxQuantity}`
                          : "+"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {pricing.variantId ? (
                        getVariantDisplay(pricing.variantId) ? (
                          <div className="flex flex-wrap gap-1">
                            {getVariantDisplay(
                              pricing.variantId
                            )?.attributes?.map((attr: any, idx: number) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-1 rounded-md bg-accent-primary/20 text-accent-primary text-sm">
                                {translateAttributeName(attr.name)}:{" "}
                                {attr.value}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-text-secondary">
                            {t("variantNotFound")}
                          </span>
                        )
                      ) : (
                        <span className="text-sm text-text-secondary">
                          {t("allVariants")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {pricing.validFrom && (
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span className="text-text-secondary">
                              {new Date(pricing.validFrom).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {pricing.validTo && (
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span className="text-text-secondary">
                              {new Date(pricing.validTo).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {!pricing.validFrom && !pricing.validTo && (
                          <span className="text-text-secondary">
                            {t("always")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={active ? "success" : "danger"}>
                        {active ? t("active") : t("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(pricing)}
                          title={t("edit") || "Edit"}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(pricing)}
                          title={t("duplicate") || "Duplicate"}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(pricing.id)}
                          className="text-danger hover:bg-danger/20"
                          title={t("delete") || "Delete"}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pricing Modal */}
      <Dialog open={showModal} onOpenChange={handleClose}>
        <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-display font-semibold text-foreground">
              {editingPricing ? t("editPricingRule") : t("addNewPricingRule")}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onSubmit, onError)}
            className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="priceType"
                  className="text-sm font-medium text-foreground">
                  {t("priceType")}
                </Label>
                <Select
                  value={form.watch("priceType")}
                  onValueChange={(value) =>
                    form.setValue(
                      "priceType",
                      value as PricingFormData["priceType"],
                      { shouldValidate: true }
                    )
                  }>
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder={t("selectType")} />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-border">
                    <SelectItem value="retail">{t("retail")}</SelectItem>
                    <SelectItem value="wholesale">{t("wholesale")}</SelectItem>
                    <SelectItem value="bulk">{t("bulk")}</SelectItem>
                    <SelectItem value="promotional">
                      {t("promotional")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.priceType && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.priceType.message}
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
                  {...form.register("price", {
                    required: t("priceRequired") || "Price is required",
                    min: {
                      value: 0,
                      message:
                        t("priceMustBePositive") || "Price must be positive",
                    },
                  })}
                  className="glass-input"
                  placeholder="0.00"
                />
                {form.formState.errors.price && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.price.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="minQuantity"
                  className="text-sm font-medium text-foreground">
                  {t("minimumQuantity")}
                </Label>
                <Input
                  id="minQuantity"
                  type="number"
                  {...form.register("minQuantity", {
                    valueAsNumber: true,
                    required:
                      t("minimumQuantityRequired") ||
                      "Minimum quantity is required",
                    min: {
                      value: 1,
                      message:
                        t("minimumQuantityMustBeAtLeastOne") ||
                        "Minimum quantity must be at least 1",
                    },
                  })}
                  className="glass-input"
                  placeholder="1"
                />
                {form.formState.errors.minQuantity && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.minQuantity.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="maxQuantity"
                  className="text-sm font-medium text-foreground">
                  {t("maximumQuantity")}
                </Label>
                <Input
                  id="maxQuantity"
                  type="number"
                  {...form.register("maxQuantity")}
                  className="glass-input"
                  placeholder={t("leaveEmptyForNoLimit")}
                />
                {form.formState.errors.maxQuantity && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.maxQuantity.message}
                  </p>
                )}
              </div>

              {variants.length > 0 && (
                <div className="space-y-2">
                  <Label
                    htmlFor="variantId"
                    className="text-sm font-medium text-foreground">
                    {t("applyToVariant")}
                  </Label>
                  <Select
                    value={form.watch("variantId") || "all"}
                    onValueChange={(value) =>
                      form.setValue(
                        "variantId",
                        value === "all" ? undefined : value,
                        { shouldValidate: true }
                      )
                    }>
                    <SelectTrigger className="glass-input">
                      <SelectValue placeholder={t("allVariantsPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-border">
                      <SelectItem value="all">{t("allVariants")}</SelectItem>
                      {variants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.attributes && variant.attributes.length > 0
                            ? variant.attributes
                                .map(
                                  (attr: any) =>
                                    `${translateAttributeName(attr.name)}: ${
                                      attr.value
                                    }`
                                )
                                .join(", ")
                            : variant.sku || t("variant")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.variantId && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.variantId.message}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="validFrom"
                    className="text-sm font-medium text-foreground">
                    {t("validFrom")}
                  </Label>
                  {form.watch("validFrom") && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() =>
                        form.setValue("validFrom", undefined, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      data-testid="button-clear-valid-from">
                      {t("clear")}
                    </Button>
                  )}
                </div>
                <Input
                  id="validFrom"
                  type="date"
                  {...form.register("validFrom")}
                  className="glass-input"
                />
                <p className="text-xs text-muted-foreground">
                  {t("leaveEmptyForNoLimit")}
                </p>
                {form.formState.errors.validFrom && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.validFrom.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="validTo"
                    className="text-sm font-medium text-foreground">
                    {t("validTo")}
                  </Label>
                  {form.watch("validTo") && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() =>
                        form.setValue("validTo", undefined, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      data-testid="button-clear-valid-to">
                      {t("clear")}
                    </Button>
                  )}
                </div>
                <Input
                  id="validTo"
                  type="date"
                  {...form.register("validTo")}
                  className="glass-input"
                />
                <p className="text-xs text-muted-foreground">
                  {t("leaveEmptyForNoLimit")}
                </p>
                {form.formState.errors.validTo && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.validTo.message}
                  </p>
                )}
              </div>
            </div>

            {/* Price Preview */}
            {form.watch("minQuantity") > 0 && (
              <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                <div className="flex items-center space-x-2 mb-3">
                  <DollarSign className="w-4 h-4 text-text-secondary" />
                  <Label className="text-sm font-medium text-foreground">
                    {t("pricePreview") || "Price Preview"}
                  </Label>
                </div>
                <div className="space-y-2 text-sm">
                  {form.watch("minQuantity") > 1 && (
                    <div className="flex justify-between items-center">
                      <span className="text-text-secondary">
                        {t("qty")} 1-{form.watch("minQuantity") - 1}:
                      </span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatCurrency(parseFloat(productPrice))}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">
                      {t("qty")} {form.watch("minQuantity")}
                      {form.watch("maxQuantity")
                        ? `-${form.watch("maxQuantity")}`
                        : "+"}
                      :
                    </span>
                    <span className="font-mono font-semibold text-primary">
                      {formatCurrency(parseFloat(form.watch("price") || "0"))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Conflict Warnings */}
            {conflictWarnings.length > 0 && (
              <div className="mt-4 p-4 bg-danger/10 rounded-lg border border-danger/20">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <Label className="text-sm font-medium text-destructive">
                    {t("conflictWarning") || "Conflict Warning"}
                  </Label>
                </div>
                <ul className="text-sm text-destructive space-y-1">
                  {conflictWarnings.map((warning, idx) => (
                    <li key={idx}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

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
                  createPricingMutation.isPending ||
                  updatePricingMutation.isPending
                }>
                {createPricingMutation.isPending ||
                updatePricingMutation.isPending
                  ? t("saving")
                  : editingPricing
                  ? t("update")
                  : t("create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("confirmDelete") || "Confirm Delete"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeletePricingRule") ||
                "Are you sure you want to delete this pricing rule? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-danger/90">
              {t("delete") || "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
