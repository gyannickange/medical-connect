import React, { useState, useEffect, useMemo } from "react";
import { X, Package, CheckCircle2, AlertTriangle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "../lib/i18n";
import { useNumberFormat } from "../hooks/useNumberFormat";
import type { Product, ProductVariant } from "@shared/schema";

interface VariantAttribute {
  name: string;
  value: string;
}

interface VariantSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  variants: ProductVariant[];
  onSelect: (variant: ProductVariant) => void;
  isEditing?: boolean;
  currentVariantId?: string;
}

export const VariantSelectionModal: React.FC<VariantSelectionModalProps> = ({
  isOpen,
  onClose,
  product,
  variants,
  onSelect,
  isEditing = false,
  currentVariantId,
}) => {
  const { t } = useTranslation();
  const { formatCurrency } = useNumberFormat();

  // Filter to only active variants
  const activeVariants = useMemo(() => {
    return variants.filter((v) => v.isActive);
  }, [variants]);

  // Get stock status for a variant
  const getStockStatus = (quantity: number, minStockAlert: number) => {
    if (quantity === 0) {
      return {
        status: "outOfStock",
        label: t("outOfStock"),
        className: "text-chart-2",
        badge: "bg-chart-2/20 text-chart-2 border-chart-2/30",
        icon: "🔴",
      };
    }
    if (quantity <= minStockAlert) {
      return {
        status: "lowStock",
        label: t("lowStock"),
        className: "text-chart-2",
        badge: "bg-chart-2/20 text-chart-2 border-chart-2/30",
        icon: "🟡",
      };
    }
    return {
      status: "inStock",
      label: t("inStock"),
      className: "text-green-600",
      badge: "bg-green-600/20 text-green-600 border-green-600/30",
      icon: "🟢",
    };
  };

  // Get variant price (use variant price if available, otherwise product price)
  const getVariantPrice = (variant: ProductVariant) => {
    return variant.price
      ? parseFloat(variant.price)
      : parseFloat(product.price);
  };

  // Format variant attributes as string
  const formatVariantAttributes = (variant: ProductVariant): string => {
    if (!variant.attributes || !Array.isArray(variant.attributes)) {
      return "";
    }
    return (variant.attributes as VariantAttribute[])
      .map((attr) => `${attr.name}: ${attr.value}`)
      .join(", ");
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-select if only one variant exists
  useEffect(() => {
    if (isOpen && activeVariants.length === 1 && !isEditing) {
      const timer = setTimeout(() => {
        onSelect(activeVariants[0]);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeVariants, isEditing, onSelect]);

  const handleSelect = (variant: ProductVariant) => {
    // Check if variant is out of stock
    if (variant.quantity === 0) {
      return;
    }
    onSelect(variant);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="glass-card max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="variant-selection-modal">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {isEditing ? t("changeVariant") : t("selectVariant")}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-close-variant-modal">
              <X className="w-6 h-6" />
            </Button>
          </div>
          <div className="flex items-center space-x-2 mt-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{product.name}</p>
          </div>
        </DialogHeader>

        {activeVariants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
            <p className="text-lg font-medium text-foreground mb-2">
              {t("noVariantsAvailable")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("addVariantsInProductManagement")}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeVariants.map((variant) => {
                const stockStatus = getStockStatus(
                  variant.quantity,
                  variant.minStockAlert || 10
                );
                const variantPrice = getVariantPrice(variant);
                const isOutOfStock = variant.quantity === 0;
                const isLowStock =
                  variant.quantity > 0 &&
                  variant.quantity <= (variant.minStockAlert || 10);
                const isSelected = currentVariantId === variant.id;

                return (
                  <div
                    key={variant.id}
                    onClick={() => !isOutOfStock && handleSelect(variant)}
                    className={`
                      relative glass-input rounded-xl p-4 cursor-pointer border-2 transition-all
                      ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }
                      ${
                        isOutOfStock
                          ? "opacity-60 cursor-not-allowed"
                          : "hover:border-primary hover:shadow-lg"
                      }
                    `}
                    data-testid={`variant-option-${variant.id}`}>
                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                    )}

                    {/* Out of stock overlay */}
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-muted/50 rounded-xl flex items-center justify-center z-10">
                        <Badge variant="danger">
                          {stockStatus.icon} {stockStatus.label}
                        </Badge>
                      </div>
                    )}

                    {/* Variant Attributes */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(variant.attributes as VariantAttribute[])?.map(
                        (attr, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-1 rounded-md bg-accent-primary/20 text-accent-primary text-xs font-medium">
                            {attr.name}: {attr.value}
                          </span>
                        )
                      )}
                    </div>

                    {/* Price */}
                    <div className="mb-2">
                      <p className="text-lg font-semibold text-foreground">
                        {formatCurrency(variantPrice)}
                      </p>
                      {variant.price && variant.price !== product.price && (
                        <p className="text-xs text-muted-foreground line-through">
                          {formatCurrency(parseFloat(product.price))}
                        </p>
                      )}
                    </div>

                    {/* Stock Information */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                      <div className="flex items-center space-x-2">
                        <span className={stockStatus.icon}></span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {variant.quantity} {t("inStock").toLowerCase()}
                        </span>
                      </div>
                      {isLowStock && (
                        <Badge variant="warning" className="text-xs">
                          {t("lowStockIndicator")}
                        </Badge>
                      )}
                    </div>

                    {/* SKU */}
                    {variant.sku && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs font-mono text-muted-foreground">
                          SKU: {variant.sku}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        {activeVariants.length > 0 && (
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {t("selectVariantInstructions")}
            </p>
            <div className="flex items-center space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-variant">
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
