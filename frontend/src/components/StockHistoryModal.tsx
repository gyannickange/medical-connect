import React, { useState } from "react";
import { X, Package, Plus, History as HistoryIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "../lib/i18n";
import { StockEntryModal } from "./StockEntryModal";
import type { Product, StockMovement } from "@shared/schema";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import {
  formatMovementDate,
  getMovementBadgeVariant,
  getQuantityChange,
} from "@/lib/movementFormat";

interface StockHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  variantId?: string;
  variantName?: string;
}

export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  isOpen,
  onClose,
  product,
  variantId,
  variantName,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddStockModal, setShowAddStockModal] = useState(false);

  // Fetch stock movements for the product or variant
  const { data: movements = [], isLoading } = useQuery<StockMovement[]>({
    queryKey: variantId
      ? ["/api/stock/variant", variantId, "movements"]
      : ["/api/stock", product?.id, "movements"],
    queryFn: async () => {
      let data: StockMovement[];
      if (variantId) {
        const response = await offlineApiRequest(
          "GET",
          `/api/stock/variant/${variantId}/movements`,
          undefined,
          { collection: "stock" }
        );
        if (!response.ok)
          throw new Error("Failed to fetch variant stock movements");
        data = await response.json();
      } else if (product?.id) {
        const response = await offlineApiRequest(
          "GET",
          `/api/stock/${product.id}/movements`,
          undefined,
          { collection: "stock" }
        );
        if (!response.ok) throw new Error("Failed to fetch stock movements");
        data = await response.json();
      } else {
        return [];
      }
      // StockRepository.findByProduct/findByVariant guarantee newest-first,
      // but an offline-queued movement is appended to the end of the cached
      // list (see upsertCachedEntity) instead of re-sorted.
      return [...data].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },
    enabled: (!!product?.id || !!variantId) && isOpen,
  });

  const handleClose = () => {
    onClose();
  };

  const handleAddStockSuccess = () => {
    // Refresh stock movements after adding stock
    if (variantId) {
      queryClient.invalidateQueries({
        queryKey: ["/api/stock/variant", variantId, "movements"],
      });
    } else {
      queryClient.invalidateQueries({
        queryKey: ["/api/stock", product?.id, "movements"],
      });
    }
    setShowAddStockModal(false);
  };

  const getMovementTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      entry: t("entry"),
      exit: t("exit"),
      adjustment: t("adjustment"),
      transfer: t("transfer"),
    };
    return (
      <Badge variant={getMovementBadgeVariant(type)}>
        {labels[type] || t("entry")}
      </Badge>
    );
  };

  const formatQuantityChange = (quantity: number, type: string) => {
    const { prefix, colorClass } = getQuantityChange(type);
    return (
      <span className={`font-mono font-semibold ${colorClass}`}>
        {prefix}
        {quantity}
      </span>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent
          className="glass-card max-w-4xl max-h-[90vh] overflow-y-auto"
          data-testid="stock-history-modal">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <HistoryIcon className="w-6 h-6 text-primary" />
                <div>
                  <DialogTitle className="text-lg font-semibold text-foreground">
                    {t("stockHistory")}
                  </DialogTitle>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  onClick={() => setShowAddStockModal(true)}
                  data-testid="button-add-stock-from-history">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("addStock")}
                </Button>
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
            </div>
          </DialogHeader>

          <div className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : movements.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 mx-auto text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground text-lg">
                  {t("noStockMovements")}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("addFirstStockMovement")}
                </p>
              </div>
            ) : (
              <div className="glass-input rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-foreground">
                        {t("date")}
                      </TableHead>
                      {!variantId && (
                        <TableHead className="text-foreground">
                          {t("variant")}
                        </TableHead>
                      )}
                      <TableHead className="text-foreground">
                        {t("movementType")}
                      </TableHead>
                      <TableHead className="text-foreground">
                        {t("change")}
                      </TableHead>
                      <TableHead className="text-foreground">
                        {t("previousQuantity")} → {t("newQuantity")}
                      </TableHead>
                      <TableHead className="text-foreground">
                        {t("reason")}
                      </TableHead>
                      <TableHead className="text-foreground">
                        {t("user")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement: StockMovement) => {
                      const movementWithVariant = movement as any;
                      const variantInfo = movementWithVariant.variantAttributes
                        ? movementWithVariant.variantAttributes
                            .map((attr: any) => `${attr.name}: ${attr.value}`)
                            .join(", ")
                        : null;
                      
                      return (
                        <TableRow
                          key={movement.id}
                          className="border-border"
                          data-testid={`movement-row-${movement.id}`}>
                          <TableCell className="text-sm">
                            {formatMovementDate(movement.createdAt)}
                          </TableCell>
                          {!variantId && (
                            <TableCell className="text-sm">
                              {variantInfo ? (
                                <div className="flex flex-col">
                                  <span className="text-foreground">
                                    {variantInfo}
                                  </span>
                                  {movementWithVariant.variantSku && (
                                    <span className="text-xs text-muted-foreground">
                                      SKU: {movementWithVariant.variantSku}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic">
                                  {t("noVariant")}
                                </span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            {getMovementTypeBadge(movement.type)}
                          </TableCell>
                          <TableCell>
                            {formatQuantityChange(
                              movement.quantity,
                              movement.type
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <span className="text-muted-foreground">
                              {movement.previousQuantity}
                            </span>
                            <span className="mx-2">→</span>
                            <span className="text-foreground font-semibold">
                              {movement.newQuantity}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                            {movement.reason || "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {(movement as any).userName || movement.userId || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Stock Modal */}
      {showAddStockModal && product && (
        <StockEntryModal
          isOpen={showAddStockModal}
          onClose={() => {
            setShowAddStockModal(false);
            handleAddStockSuccess();
          }}
          mode="entry"
          preselectedProductId={product.id}
          preselectedVariantId={variantId}
        />
      )}
    </>
  );
};
