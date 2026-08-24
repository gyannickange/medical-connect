import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDebounce } from "use-debounce";
import {
  X,
  User,
  Banknote,
  FileText,
  Download,
  Scan,
  Package,
  Plus,
  Search,
  Printer,
  Tag,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { useNumberFormat } from "../hooks/useNumberFormat";
import { useSettings } from "../hooks/useSettings";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { findProductByBarcode, offlineApiRequest } from "@/lib/offlineApiRequest";
import { computeSaleTotals } from "@/lib/saleTotals";
import { useToast } from "@/hooks/use-toast";
import { BarcodeScanner } from "./BarcodeScanner";
import { VariantSelectionModal } from "./VariantSelectionModal";
import { apiRequest } from "@/lib/queryClient";
import { resolveProductPrice } from "@/lib/resolveProductPrice";
import type {
  Product,
  ProductVariant,
  Sale,
  Customer,
  User as StaffUser,
  Tenant,
} from "@shared/schema";

interface SaleItem {
  product: Product;
  variant?: ProductVariant;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceType?: string;
  appliedRule?: any;
  pricingId?: string;
}

const saleSchema = z.object({
  customerId: z.string().optional(),
  paymentMethod: z.enum(["cash"]),
  subtotal: z.number().min(0),
  tax: z.number().min(0),
  total: z.number().min(0),
});

type SaleForm = z.infer<typeof saleSchema>;

interface SaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleItems: SaleItem[];
  total: number;
  onAddItem?: (item: SaleItem) => void;
  onRemoveItem?: (productId: string, variantId?: string) => void;
  onUpdateQuantity?: (
    productId: string,
    quantity: number,
    priceTypeOverride?: string,
    variantId?: string
  ) => void;
}

export const SaleModal: React.FC<SaleModalProps> = ({
  isOpen,
  onClose,
  saleItems,
  total,
  onAddItem,
  onRemoveItem,
  onUpdateQuantity,
}) => {
  const { t } = useTranslation();

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
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { formatCurrency } = useNumberFormat();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    getAutoPrintReceipt,
    getDefaultCurrency,
    getCurrencyFormat,
    getCompanyName,
    getCompanyPhone,
    getCompanyEmail,
    getCompanyAddress,
    getSetting,
    getDefaultTaxRate,
  } = useSettings();
  // getDefaultTaxRate() is a percentage (e.g. 20 for 20%); computeSaleTotals
  // expects a fraction, matching the tenant's configured rate from Settings
  // instead of always defaulting to 20%.
  const taxRate = getDefaultTaxRate() / 100;
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showInvoiceOptions, setShowInvoiceOptions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [showSearchResults, setShowSearchResults] = useState(false);
  // Track manual price type overrides for each item
  const [manualPriceTypes, setManualPriceTypes] = useState<
    Record<string, string>
  >({});
  // Buffers what the cashier is typing into a cart line's quantity input,
  // keyed like manualPriceTypes, so keystrokes don't fight the item's
  // committed `quantity` prop until Enter/blur commits the new value.
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(
    {}
  );
  // Variant selection state
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] =
    useState<Product | null>(null);
  const [editingVariantItem, setEditingVariantItem] = useState<SaleItem | null>(
    null
  );

  // `total` (prop) is the cart's raw sum of unitPrice * quantity — tax
  // exclusive. See frontend/src/lib/saleTotals.ts for why this must not be
  // treated as already including tax (BUG-002, 2026-08-12 QA report).
  const { subtotal, tax, total: totalWithTax } = computeSaleTotals(total, taxRate);

  const form = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      customerId: "",
      paymentMethod: "cash",
      subtotal: subtotal,
      tax: tax,
      total: totalWithTax,
    },
  });

  // Update form values when the cart's pre-tax subtotal (the `total` prop) changes
  useEffect(() => {
    const totals = computeSaleTotals(total, taxRate);

    form.setValue("subtotal", totals.subtotal);
    form.setValue("tax", totals.tax);
    form.setValue("total", totals.total);

  }, [total, taxRate, form]);

  // Fetch customers for selection
  const { data: customers = [] } = useQuery({
    queryKey: ["/api/customers", currentTenant?.id],
    enabled: !!currentTenant?.id && isOpen,
  });

  // Fetch products for search and selection
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products", currentTenant?.id],
    enabled: !!currentTenant?.id && isOpen,
  });

  // Fetch staff to get a valid user ID for the sale
  const { data: staff = [] } = useQuery({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id && isOpen,
  });

  // Fetch variants for the selected product
  const { data: productVariants = [] } = useQuery<any[]>({
    queryKey: [`/api/products/${selectedProductForVariant?.id}/variants`],
    enabled: !!selectedProductForVariant?.id && isOpen,
  });

  // Fetch pricing rules for all products in sale items
  // Get unique product IDs from sale items
  const productIds = useMemo(() => {
    return [...new Set(saleItems.map((item) => item.product.id))];
  }, [saleItems]);

  // Fetch all pricing rules for products in the sale
  const pricingQueries = useQuery({
    queryKey: ["/api/products/pricing", productIds],
    enabled: productIds.length > 0 && !!currentTenant?.id && isOpen,
    queryFn: async () => {
      // Fetch pricing for all products in parallel
      const results = await Promise.all(
        productIds.map(async (productId) => {
          try {
            const response = await offlineApiRequest(
              "GET",
              `/api/products/pricing/${productId}`
            );
            const rules = await response.json();
            return { productId, rules };
          } catch (error) {
            console.error(`Failed to fetch pricing for ${productId}:`, error);
            return { productId, rules: [] };
          }
        })
      );
      return results;
    },
  });

  // Extract unique price types per product and variant from the fetched rules
  const availablePriceTypes = useMemo(() => {
    const result: Record<string, string[]> = {};
    if (pricingQueries.data) {
      pricingQueries.data.forEach(({ productId, rules }) => {
        // For each sale item, find matching pricing rules based on variant
        saleItems.forEach((item) => {
          if (item.product.id === productId) {
            const key = `${productId}-${item.variantId || "base"}`;
            // Filter rules that match the variant
            const matchingRules = rules.filter((rule: any) => {
              if (!rule.isActive) return false;

              const ruleVariantId = rule.variantId || null;
              const itemVariantId = item.variantId || null;

              // Match if:
              // 1. Rule has no variantId (applies to all variants), OR
              // 2. Rule's variantId matches the item's variantId (variant-specific rule)
              return ruleVariantId === null || ruleVariantId === itemVariantId;
            });
            const priceTypes: string[] = Array.from(
              new Set(matchingRules.map((rule: any) => rule.priceType))
            );
            result[key] = priceTypes;
          }
        });
      });
    }
    return result;
  }, [pricingQueries.data, saleItems]);

  // Create sale mutation
  const createSaleMutation = useMutation({
    mutationFn: async (data: SaleForm) => {
      const saleData = {
        customerId: data.customerId || null,
        userId: user?.id,
        subtotal: parseFloat(data.subtotal.toFixed(2)),
        tax: parseFloat(data.tax.toFixed(2)),
        total: parseFloat(data.total.toFixed(2)),
        paymentMethod: data.paymentMethod,
        status: "completed",
        tenantId: currentTenant?.id,
      };

      const items = saleItems.map((item) => ({
        productId: item.product.id,
        product: item.product,
        variantId: item.variantId || null,
        variant: item.variant,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unitPrice.toFixed(2)),
        totalPrice: parseFloat(item.totalPrice.toFixed(2)),
        priceType: item.priceType || null,
        pricingId: item.pricingId || item.appliedRule?.id || null,
      }));

      const response = await offlineApiRequest(
        "POST",
        "/api/sales",
        {
          sale: saleData,
          items,
        },
        { collection: "sales" }
      );
      return response.json();
    },
    onSuccess: async (sale: Sale) => {
      // Check if this was a synthetic response (offline save)
      const isOffline = (sale as any)?._savedOffline === true;

      queryClient.invalidateQueries({
        queryKey: ["/api/sales", currentTenant?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard", currentTenant?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/stock", currentTenant?.id],
      });
      // A sale decrements product stock (applyLocalSaleStockDeductions
      // offline, ProductsRepository.adjustStock online) - without this, the
      // products list stays stale in react-query's cache until something
      // else happens to invalidate it, even though the underlying stock was
      // correctly updated.
      queryClient.invalidateQueries({
        queryKey: ["/api/products", currentTenant?.id],
      });

      // A queued-offline sale (permanent in local installs, temporary on a
      // connectivity blip) still has everything a receipt needs - id, sale
      // number, total, items - so it gets the same receipt/print flow as an
      // online sale, not just a toast and a closed modal.
      setCompletedSale(sale);

      // Auto-generate receipt if setting is enabled
      const autoPrint = getAutoPrintReceipt();
      if (autoPrint) {
        // Print invoice immediately
        await printInvoiceForSale(sale);
        // Close modal after printing invoice
        setTimeout(() => {
          handleClose();
        }, 500);
      } else {
        setShowInvoiceOptions(true);
      }

      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("saleSavedOffline")
          : t("saleCompletedSuccessfully"),
        variant: "success",
      });
    },
    onError: () => {
      toast({
        title: t("error"),
        description: t("failedToCompleteSale"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SaleForm) => {
    // Use current calculated values instead of form data to ensure accuracy
    const totals = computeSaleTotals(total, taxRate);

    const saleData = {
      ...data,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    };

    createSaleMutation.mutate(saleData);
  };

  const handleClose = () => {
    form.reset();
    setSelectedCustomer("");
    setCustomerSearch("");
    setCompletedSale(null);
    setShowInvoiceOptions(false);
    setSearchQuery("");
    setShowSearchResults(false);
    setManualPriceTypes({}); // Reset manual price type overrides
    setShowVariantModal(false); // Close variant modal if open
    setSelectedProductForVariant(null);
    setEditingVariantItem(null);
    onClose();
  };

  const generateInvoiceForSale = async (sale: Sale) => {
    try {
      // Get company info from settings
      const companyInfo = {
        name: getCompanyName() || "Retail Store",
        phone: getCompanyPhone(),
        email: getCompanyEmail(),
        address: getCompanyAddress(),
      };

      // Get selected customer data
      const customer = selectedCustomer
        ? (customers as Customer[]).find((c) => c.id === selectedCustomer)
        : undefined;

      // Get staff member data
      const staffMember = (staff as StaffUser[]).find(
        (s) => s.id === sale.userId
      );

      // Get format options from settings
      const currencyFormat = getCurrencyFormat();
      const defaultCurrency = getDefaultCurrency();

      // Prepare receipt/invoice data
      const receiptData = {
        sale: sale,
        companyInfo: companyInfo,
        customer: customer as Customer,
        staff: staffMember as StaffUser,
        items: saleItems.map((item) => {
          // Get priceType from item, appliedRule, or manualPriceTypes override
          const priceTypeKey = `${item.product.id}-${item.variantId || "base"}`;
          const manualPriceType = manualPriceTypes[priceTypeKey];
          const finalPriceType =
            item.priceType ||
            item.appliedRule?.priceType ||
            (manualPriceType && manualPriceType !== "auto"
              ? manualPriceType
              : null);

          return {
            id: item.product.id,
            saleId: sale.id,
            productId: item.product.id,
            variantId: item.variantId || null,
            variant: item.variant || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toString(),
            totalPrice: item.totalPrice.toString(),
            product: item.product,
            priceType: finalPriceType,
            pricing:
              item.pricingId || item.appliedRule
                ? {
                    id: item.pricingId || item.appliedRule?.id,
                    priceType: finalPriceType,
                    minQuantity: item.appliedRule?.minQuantity,
                    maxQuantity: item.appliedRule?.maxQuantity,
                  }
                : null,
          };
        }),
        formatOptions: {
          currency: defaultCurrency,
          ...currencyFormat,
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
      toast({
        title: t("invoiceGenerated"),
        description: t("invoiceGeneratedSuccess"),
        variant: "success",
      });
    } catch (error) {
      console.error("Invoice generation error:", error);
      toast({
        title: t("error"),
        description: t("errorGeneratingInvoice"),
        variant: "destructive",
      });
    }
  };

  const generateInvoice = async () => {
    if (!completedSale) return;
    await generateInvoiceForSale(completedSale);
  };

  const printInvoiceForSale = async (sale: Sale) => {
    try {
      // Get company info from settings
      const companyInfo = {
        name: getCompanyName() || "Retail Store",
        phone: getCompanyPhone(),
        email: getCompanyEmail(),
        address: getCompanyAddress(),
      };

      // Get selected customer data
      const customer = selectedCustomer
        ? (customers as Customer[]).find((c) => c.id === selectedCustomer)
        : undefined;

      // Get staff member data
      const staffMember = (staff as StaffUser[]).find(
        (s) => s.id === sale.userId
      );

      // Get format options from settings
      const currencyFormat = getCurrencyFormat();
      const defaultCurrency = getDefaultCurrency();

      // Prepare receipt/invoice data
      const receiptData = {
        sale: sale,
        companyInfo: companyInfo,
        customer: customer as Customer,
        staff: staffMember as StaffUser,
        items: saleItems.map((item) => {
          // Get priceType from item, appliedRule, or manualPriceTypes override
          const priceTypeKey = `${item.product.id}-${item.variantId || "base"}`;
          const manualPriceType = manualPriceTypes[priceTypeKey];
          const finalPriceType =
            item.priceType ||
            item.appliedRule?.priceType ||
            (manualPriceType && manualPriceType !== "auto"
              ? manualPriceType
              : null);

          return {
            id: item.product.id,
            saleId: sale.id,
            productId: item.product.id,
            variantId: item.variantId || null,
            variant: item.variant || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toString(),
            totalPrice: item.totalPrice.toString(),
            product: item.product,
            priceType: finalPriceType,
            pricing:
              item.pricingId || item.appliedRule
                ? {
                    id: item.pricingId || item.appliedRule?.id,
                    priceType: finalPriceType,
                    minQuantity: item.appliedRule?.minQuantity,
                    maxQuantity: item.appliedRule?.maxQuantity,
                  }
                : null,
          };
        }),
        formatOptions: {
          currency: defaultCurrency,
          ...currencyFormat,
        },
      };

      // Check receipt format setting (default to "retail")
      const receiptFormat = getSetting("receiptFormat", "retail");

      // Print appropriate receipt/invoice based on setting
      if (receiptFormat === "retail") {
        const { printRetailReceipt } = await import(
          "@/utils/receiptGenerator"
        );
        await printRetailReceipt(receiptData as any);
      } else {
        const { printInvoice } = await import("@/utils/pdfGenerator");
        await printInvoice(receiptData as any);
      }
    } catch (error) {
      console.error("Print invoice error:", error);
      toast({
        title: t("error"),
        description: t("failedToPrintInvoice"),
        variant: "destructive",
      });
    }
  };

  // Filter products based on debounced search query (for display)
  const filteredProducts = React.useMemo(() => {
    if (!debouncedSearchQuery.trim()) return [];
    return (products as Product[])
      .filter(
        (product: Product) =>
          product.name
            .toLowerCase()
            .includes(debouncedSearchQuery.toLowerCase()) ||
          product.barcode
            ?.toLowerCase()
            .includes(debouncedSearchQuery.toLowerCase())
      )
      .slice(0, 5); // Limit to 5 results for UI performance
  }, [products, debouncedSearchQuery]);

  // Filter products based on immediate search query (for keyboard shortcuts like Enter)
  const immediateFilteredProducts = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    return (products as Product[])
      .filter(
        (product: Product) =>
          product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          product.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 5); // Limit to 5 results for UI performance
  }, [products, searchQuery]);

  const filteredCustomers = (customers as Customer[]).filter((customer) => {
    const fullName = `${customer.firstName} ${customer.lastName}`.toLowerCase();
    return (
      fullName.includes(customerSearch.toLowerCase()) ||
      customer.phone?.includes(customerSearch) ||
      customer.email?.toLowerCase().includes(customerSearch.toLowerCase())
    );
  });

  // Helper to get badge styling for price type
  const getPriceTypeBadge = (priceType?: string) => {
    if (!priceType) return null;
    const badges: Record<string, { label: string; variant: "success" | "secondary" | "danger" }> = {
      retail: { label: t("retail"), variant: "success" },
      wholesale: { label: t("wholesale"), variant: "secondary" },
      bulk: { label: t("bulk"), variant: "secondary" },
      promotional: { label: t("promotion"), variant: "danger" },
    };
    const badge = badges[priceType];
    if (!badge) return null;
    return (
      <Badge variant={badge.variant}>
        <Tag className="w-3 h-3 mr-1" />
        {badge.label}
      </Badge>
    );
  };

  // Helper function to calculate product price based on quantity.
  // Resolved locally from the product's already-replicated pricingRules/
  // variants (mirrors backend/src/modules/products/products.repository.ts's
  // calculateProductPrice exactly) so this works offline and always agrees
  // with what SalesService.resolveAndVerify recomputes when the sale syncs.
  const calculateProductPrice = async (
    product: Product,
    quantity: number,
    priceTypeOverride?: string,
    variant?: ProductVariant
  ): Promise<{ price: string; rule?: any; priceType?: string }> => {
    const result = resolveProductPrice(
      product,
      quantity,
      variant?.id,
      priceTypeOverride
    );
    return {
      price: result.price,
      rule: result.rule,
      priceType: result.rule?.priceType,
    };
  };

  // Handle product search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Update showSearchResults based on debounced query
  useEffect(() => {
    setShowSearchResults(debouncedSearchQuery.trim().length > 0);
  }, [debouncedSearchQuery]);

  // Handle manual price type override
  const handlePriceTypeChange = async (
    productId: string,
    variantId: string | undefined,
    priceType: string
  ) => {
    // Create composite key to match availablePriceTypes pattern
    const priceTypeKey = `${productId}-${variantId || "base"}`;

    // Find the item by both productId and variantId
    const item = saleItems.find(
      (i) =>
        i.product.id === productId &&
        (i.variantId || undefined) === (variantId || undefined)
    );
    if (!item) return;

    // Update manual override state using composite key
    setManualPriceTypes((prev) => ({ ...prev, [priceTypeKey]: priceType }));

    // Trigger quantity update with price type override
    // The Dashboard's handleUpdateQuantity will recalculate with the new price type
    // For "none", Dashboard will use base product price without pricing rules
    if (onUpdateQuantity) {
      onUpdateQuantity(productId, item.quantity, priceType, item.variantId);
    }
  };

  // Handle adding product to sale
  const addToSale = async (product: Product) => {
    // Check if product has variants
    try {
      const variantResponse = await offlineApiRequest(
        "GET",
        `/api/products/${product.id}/variants`
      );
      const variants = await variantResponse.json();

      // If product has variants, open variant selection modal
      if (variants && variants.length > 0) {
        const activeVariants = variants.filter((v: any) => v.isActive);
        if (activeVariants.length > 0) {
          setSelectedProductForVariant(product);
          setShowVariantModal(true);
          return;
        }
      }
    } catch (error) {
      console.error("Failed to check for variants:", error);
    }

    // If no variants, proceed with normal add flow
    const existingItem = saleItems.find(
      (item) => item.product.id === product.id && !item.variantId
    );

    if (existingItem && onUpdateQuantity) {
      // Increase quantity if item already exists (non-variant product) -
      // preserve the cashier's manual override (if any) instead of
      // dropping back to base price; "auto" re-detects the best matching
      // rule for the new quantity when no override was chosen.
      const priceTypeKey = `${product.id}-base`;
      onUpdateQuantity(
        product.id,
        existingItem.quantity + 1,
        manualPriceTypes[priceTypeKey] || "auto",
        undefined
      );
    } else if (onAddItem) {
      // Calculate price for quantity 1, auto-detecting the best matching
      // rule (undefined = no override) so a rule that already applies at
      // quantity 1 (e.g. a promotional price) is picked up immediately.
      const priceData = await calculateProductPrice(product, 1, undefined);
      const unitPrice = parseFloat(priceData.price);

      // Add new item to sale
      const newItem: SaleItem = {
        product,
        quantity: 1,
        unitPrice,
        totalPrice: unitPrice,
        priceType: priceData.priceType,
        appliedRule: priceData.rule,
      };
      onAddItem(newItem);
    }

    // Clear search after adding
    setSearchQuery("");
    setShowSearchResults(false);
  };

  // Handle variant selection from modal
  const handleVariantSelected = async (variant: ProductVariant) => {
    if (!selectedProductForVariant) return;

    // If editing existing variant, remove old item and add new one
    if (editingVariantItem && onRemoveItem && onAddItem) {
      // Preserve the original quantity
      const preservedQuantity = editingVariantItem.quantity;

      // Use composite key to remove the specific variant
      onRemoveItem(editingVariantItem.product.id, editingVariantItem.variantId);

      // Calculate price for the preserved quantity - keep the cashier's
      // manual override (if any) that was already applied to the item
      // being replaced; "auto" (undefined) re-detects otherwise.
      const editingPriceTypeKey = `${editingVariantItem.product.id}-${
        editingVariantItem.variantId || "base"
      }`;
      const editingManualPriceType = manualPriceTypes[editingPriceTypeKey];
      const priceData = await calculateProductPrice(
        selectedProductForVariant,
        preservedQuantity,
        editingManualPriceType === "auto" || !editingManualPriceType
          ? undefined
          : editingManualPriceType,
        variant
      );
      const unitPrice = parseFloat(priceData.price);
      const totalPrice = preservedQuantity * unitPrice;

      // Add new item to sale with variant, preserving quantity
      const newItem: SaleItem = {
        product: selectedProductForVariant,
        variant: variant,
        variantId: variant.id,
        quantity: preservedQuantity,
        unitPrice,
        totalPrice,
        priceType: priceData.priceType,
        appliedRule: priceData.rule,
      };
      onAddItem(newItem);

      toast({
        title: t("success"),
        description: t("variantUpdated"),
        variant: "success",
      });
    } else {
      const existingItem = saleItems.find(
        (item) =>
          item.product.id === selectedProductForVariant.id &&
          item.variantId === variant.id
      );

      if (existingItem && onUpdateQuantity) {
        // Increase quantity if same variant already exists - preserve the
        // cashier's manual override (if any); "auto" re-detects otherwise.
        const priceTypeKey = `${selectedProductForVariant.id}-${variant.id}`;
        onUpdateQuantity(
          selectedProductForVariant.id,
          existingItem.quantity + 1,
          manualPriceTypes[priceTypeKey] || "auto",
          variant.id
        );
      } else if (onAddItem) {
        // Calculate price for quantity 1, auto-detecting the best matching
        // rule (undefined = no override).
        const priceData = await calculateProductPrice(
          selectedProductForVariant,
          1,
          undefined,
          variant
        );
        const unitPrice = parseFloat(priceData.price);

        // Add new item to sale with variant
        const newItem: SaleItem = {
          product: selectedProductForVariant,
          variant: variant,
          variantId: variant.id,
          quantity: 1,
          unitPrice,
          totalPrice: unitPrice,
          priceType: priceData.priceType,
          appliedRule: priceData.rule,
        };
        onAddItem(newItem);

        // Show toast with variant details
        const variantAttrString = (variant.attributes as any[])
          ?.map(
            (attr: any) => `${translateAttributeName(attr.name)}: ${attr.value}`
          )
          .join(", ");
        toast({
          title: t("success"),
          description: `${
            selectedProductForVariant.name
          } (${variantAttrString}) ${t("productAddedToSale")}`,
          variant: "success",
        });
      }
    }

    // Clear modal state
    setShowVariantModal(false);
    setSelectedProductForVariant(null);
    setEditingVariantItem(null);
    setSearchQuery("");
    setShowSearchResults(false);
  };

  // Handle clicking variant badge to change variant
  const handleEditVariant = async (item: SaleItem) => {
    if (!item.variant) return;

    try {
      const variantResponse = await offlineApiRequest(
        "GET",
        `/api/products/${item.product.id}/variants`
      );
      const variants = await variantResponse.json();

      if (variants && variants.length > 0) {
        const activeVariants = variants.filter((v: any) => v.isActive);
        if (activeVariants.length > 0) {
          setSelectedProductForVariant(item.product);
          setEditingVariantItem(item);
          setShowVariantModal(true);
        }
      }
    } catch (error) {
      console.error("Failed to fetch variants:", error);
    }
  };

  // Close variant modal
  const handleCloseVariantModal = () => {
    setShowVariantModal(false);
    setSelectedProductForVariant(null);
    setEditingVariantItem(null);
  };

  // Handle barcode scan result
  const handleBarcodeResult = async (barcode: string) => {
    try {
      if (!currentTenant?.id) return;
      const product = await findProductByBarcode(currentTenant.id, barcode);
      if (product) {
        addToSale(product as any);
        toast({
          title: t("success"),
          description: `${product.name} ${t("productAddedToSale")}`,
          variant: "success",
        });
      } else {
        toast({
          title: t("error"),
          description: t("productNotFoundBarcode"),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t("error"),
        description: t("failedToFindProduct"),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="glass-card w-[95vw] max-w-6xl h-[88vh] max-h-[880px] flex flex-col gap-0 p-0 overflow-hidden"
        data-testid="sale-modal">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {t("completeSale")}
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

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_360px]">
          {/* Left column: product search + cart. The main working area, so
              it gets the wider column and the internal scroll region. */}
          <div className="flex min-h-0 flex-col border-border md:border-r">
          {/* Add Products Section - Only show if invoice options are not displayed */}
          {!showInvoiceOptions && (
            <div className="shrink-0 space-y-3 border-b border-border p-6 pb-4">
              <div className="flex items-end gap-2">
                {/* Product Search */}
                <div className="flex-1 space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    {t("searchProducts")}
                  </Label>
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder={t("searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          immediateFilteredProducts.length > 0
                        ) {
                          addToSale(immediateFilteredProducts[0]);
                        }
                      }}
                      className="glass-input rounded-xl w-full pl-12 pr-4 py-3 text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                      data-testid="input-product-search"
                  />
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />

                  {/* Search Results Dropdown */}
                  {showSearchResults && filteredProducts.length > 0 && (
                    <div
                      className="absolute z-50 w-full mt-1 glass-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto"
                      data-testid="search-results">
                      {filteredProducts.map((product: Product) => {
                        // Check if product has variants
                        const productVariants = (product as any).variants || [];
                        const hasVariants =
                          productVariants && productVariants.length > 0;
                        const activeVariants = hasVariants
                          ? productVariants.filter(
                              (v: any) => v.isActive !== false
                            )
                          : [];

                        return (
                          <div
                            key={product.id}
                            className="flex items-center justify-between p-3 hover:bg-muted cursor-pointer border-b border-border last:border-b-0"
                            onClick={() => addToSale(product)}
                            data-testid={`search-result-${product.id}`}>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <p className="font-medium text-foreground">
                                  {product.name}
                                </p>
                                {hasVariants && activeVariants.length > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs bg-accent-primary/10 text-accent-primary border-accent-primary/30">
                                    {activeVariants.length}{" "}
                                    {activeVariants.length === 1
                                      ? t("variant")
                                      : t("variants")}
                                  </Badge>
                                )}
                                {!hasVariants && (product as any).stocks && (
                                  <Badge variant="outline" className="text-xs">
                                    {t("stock")}:{" "}
                                    {(product as any).stocks.quantity || 0}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {formatCurrency(parseFloat(product.price))}
                              </p>
                              {/* Show variant preview if available */}
                              {hasVariants &&
                                activeVariants.length > 0 &&
                                activeVariants
                                  .slice(0, 2)
                                  .map((variant: any, idx: number) => {
                                    const variantText =
                                      variant.attributes &&
                                      Array.isArray(variant.attributes)
                                        ? variant.attributes
                                            .map(
                                              (attr: any) =>
                                                `${translateAttributeName(
                                                  attr.name
                                                )}: ${attr.value}`
                                            )
                                            .join(", ")
                                        : variant.sku || t("variant");

                                    return (
                                      <p
                                        key={idx}
                                        className="text-xs text-muted-foreground mt-1">
                                        • {variantText}
                                        {variant.quantity !== undefined && (
                                          <span className="ml-1">
                                            ({t("stock")}: {variant.quantity})
                                          </span>
                                        )}
                                      </p>
                                    );
                                  })}
                              {hasVariants && activeVariants.length > 2 && (
                                <p className="text-xs text-muted-foreground italic mt-1">
                                  +{activeVariants.length - 2}{" "}
                                  {t("moreVariants")}
                                </p>
                              )}
                              {/* Show stock for products without variants */}
                              {!hasVariants && (product as any).stocks && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {t("stock")}:{" "}
                                  {(product as any).stocks.quantity || 0}
                                  {(product as any).stocks.reservedQuantity >
                                    0 && (
                                    <span className="ml-1 italic text-muted-foreground/70">
                                      ({t("reserved")}:{" "}
                                      {(product as any).stocks.reservedQuantity}
                                      )
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              className="p-2"
                              data-testid={`button-add-${product.id}`}>
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* No Results */}
                  {showSearchResults &&
                    searchQuery &&
                    filteredProducts.length === 0 && (
                      <div
                        className="absolute z-50 w-full mt-1 glass-card border border-border rounded-lg shadow-lg p-4 text-center text-muted-foreground"
                        data-testid="no-search-results">
                        {t("noProductsFound")} "{searchQuery}"
                      </div>
                    )}
                </div>
                </div>

                {/* Barcode Scanner - icon-only trigger beside search, not its
                    own labeled row, to keep this header compact. */}
                <BarcodeScanner onScanResult={handleBarcodeResult}>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    title={t("scanBarcode")}
                    data-testid="button-open-scanner">
                    <Scan className="w-4 h-4" />
                  </Button>
                </BarcodeScanner>
              </div>
            </div>
          )}

          {/* Sale Items Summary - fills the rest of the left column's
              height and scrolls internally, instead of capping at
              max-h-48 and pushing checkout below the fold. */}
          <div className="flex flex-1 min-h-0 flex-col p-6 pt-4">
            <h3 className="mb-3 shrink-0 font-medium text-foreground">
              {t("itemsSold")}
            </h3>
            <ScrollArea className="glass-input min-h-0 flex-1 rounded-xl">
            <div className="p-4">
              {saleItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{t("noItemsInSale")}</p>
                </div>
              ) : (
                saleItems.map((item) => (
                  <div
                    key={`${item.product.id}-${item.variantId || "base"}`}
                    className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                    <div className="flex items-center space-x-3 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <p className="font-medium text-foreground">
                            {item.product.name}
                          </p>
                          {getPriceTypeBadge(item.priceType)}
                        </div>
                        {/* Variant attributes */}
                        {item.variant &&
                        Array.isArray(item.variant.attributes) &&
                        item.variant.attributes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {item.variant.attributes.map(
                              (attr: any, idx: number) => (
                                <span
                                  key={idx}
                                  onClick={() => handleEditVariant(item)}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent-primary/20 text-accent-primary text-xs font-medium cursor-pointer hover:bg-accent-primary/30 transition-colors">
                                  {translateAttributeName(attr.name)}:{" "}
                                  {attr.value}
                                </span>
                              )
                            )}
                          </div>
                        ) : null}
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(item.unitPrice)} × {item.quantity}
                        </p>

                        {/* Price Type Selector */}
                        {(() => {
                          const priceTypeKey = `${item.product.id}-${
                            item.variantId || "base"
                          }`;
                          const priceTypes =
                            availablePriceTypes[priceTypeKey] || [];
                          return (
                            priceTypes.length > 0 && (
                              <div className="flex items-center space-x-2 mt-1">
                                <Label className="text-xs text-muted-foreground">
                                  {t("overridePrice")}:
                                </Label>
                                <Select
                                  disabled={priceTypes.length === 0}
                                  value={
                                    manualPriceTypes[priceTypeKey] || "auto"
                                  }
                                  onValueChange={(value) =>
                                    handlePriceTypeChange(
                                      item.product.id,
                                      item.variantId,
                                      value
                                    )
                                  }>
                                  <SelectTrigger className="glass-input h-8 text-xs w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="glass-card border-border">
                                    <SelectItem value="auto">
                                      {t("autoPrice")}
                                    </SelectItem>
                                    <SelectItem value="none">
                                      {t("none")}
                                    </SelectItem>
                                    {priceTypes.includes("retail") && (
                                      <SelectItem value="retail">
                                        {t("retail")}
                                      </SelectItem>
                                    )}
                                    {priceTypes.includes("wholesale") && (
                                      <SelectItem value="wholesale">
                                        {t("wholesale")}
                                      </SelectItem>
                                    )}
                                    {priceTypes.includes("bulk") && (
                                      <SelectItem value="bulk">
                                        {t("bulk")}
                                      </SelectItem>
                                    )}
                                    {priceTypes.includes("promotional") && (
                                      <SelectItem value="promotional">
                                        {t("promotion")}
                                      </SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                            )
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {/* Quantity Controls */}
                      {(() => {
                        const priceTypeKey = `${item.product.id}-${
                          item.variantId || "base"
                        }`;
                        // Pass the cashier's current explicit choice so a
                        // quantity change never silently drops an
                        // already-applied override. When no override has
                        // been picked, "auto" re-detects the best matching
                        // rule for the new quantity (e.g. crossing into a
                        // bulk-quantity tier) instead of freezing at the
                        // base price.
                        const priceTypeToPass =
                          manualPriceTypes[priceTypeKey] || "auto";

                        const commitQuantityDraft = () => {
                          const draft = quantityDrafts[priceTypeKey];
                          if (draft === undefined) return;
                          const parsed = parseInt(draft, 10);
                          if (Number.isFinite(parsed) && parsed > 0) {
                            onUpdateQuantity?.(
                              item.product.id,
                              parsed,
                              priceTypeToPass,
                              item.variantId
                            );
                          }
                          setQuantityDrafts((prev) => {
                            const { [priceTypeKey]: _, ...rest } = prev;
                            return rest;
                          });
                        };

                        return (
                          <div className="flex items-center space-x-2 border border-border rounded-lg">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                onUpdateQuantity &&
                                onUpdateQuantity(
                                  item.product.id,
                                  item.quantity - 1,
                                  priceTypeToPass,
                                  item.variantId
                                )
                              }
                              className="w-8 h-8 p-0 rounded-l-lg"
                              data-testid={`button-decrease-${item.product.id}`}>
                              -
                            </Button>
                            <Input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={
                                quantityDrafts[priceTypeKey] ??
                                String(item.quantity)
                              }
                              onChange={(e) =>
                                setQuantityDrafts((prev) => ({
                                  ...prev,
                                  [priceTypeKey]: e.target.value,
                                }))
                              }
                              onBlur={commitQuantityDraft}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  setQuantityDrafts((prev) => {
                                    const { [priceTypeKey]: _, ...rest } = prev;
                                    return rest;
                                  });
                                  e.currentTarget.blur();
                                }
                              }}
                              className="h-8 w-14 border-0 bg-transparent px-1 text-center text-sm font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              data-testid={`quantity-${item.product.id}`}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                onUpdateQuantity &&
                                onUpdateQuantity(
                                  item.product.id,
                                  item.quantity + 1,
                                  priceTypeToPass,
                                  item.variantId
                                )
                              }
                              className="w-8 h-8 p-0 rounded-r-lg"
                              data-testid={`button-increase-${item.product.id}`}>
                              +
                            </Button>
                          </div>
                        );
                      })()}

                      {/* Total Price */}
                      <p className="font-mono font-semibold text-foreground min-w-[5ch] text-right">
                        {formatCurrency(item.totalPrice)}
                      </p>

                      {/* Remove Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onRemoveItem &&
                          onRemoveItem(item.product.id, item.variantId)
                        }
                        className="w-8 h-8 p-0 text-chart-2 hover:bg-chart-2/20 rounded-full"
                        data-testid={`button-remove-${item.product.id}-${
                          item.variantId || "base"
                        }`}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            </ScrollArea>
          </div>
          </div>

          {/* Right column: checkout sidebar - customer, payment, totals,
              and the submit action stay visible without scrolling past the
              product list, and swap for the post-sale receipt options. */}
          <div className="flex min-h-0 flex-col overflow-y-auto p-6">

          {/* Invoice Options - Show after successful sale */}
          {showInvoiceOptions && completedSale && (
            <div className="glass-input rounded-xl p-6 border-2 border-green-500/20 bg-green-500/5">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-foreground text-sm">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {t("saleCompletedSuccessfully")}
                  </h3>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("generateInvoicePrompt")}
                </p>

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    onClick={async () => {
                      if (completedSale) {
                        await printInvoiceForSale(completedSale);
                      }
                    }}
                    className="flex w-full items-center justify-center space-x-2"
                    data-testid="button-print-invoice">
                    <Printer className="w-4 h-4" />
                    <span>{t("printInvoice")}</span>
                  </Button>

                  <Button
                    type="button"
                    onClick={generateInvoice}
                    variant="outline"
                    className="flex w-full items-center justify-center space-x-2"
                    data-testid="button-generate-invoice">
                    <Download className="w-4 h-4" />
                    <span>{t("generatePdfInvoice")}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="w-full"
                    data-testid="button-close-completed">
                    <span>{t("close")}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-sale">
            {/* Customer Selection - Only show if invoice options are not displayed */}
            {!showInvoiceOptions && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  {t("customer")} (Optional)
                </Label>
                <div className="space-y-2">
                  <Input
                    placeholder={t("searchCustomersPlaceholder")}
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="glass-input rounded-xl"
                    data-testid="input-customer-search"
                  />
                  {customerSearch && filteredCustomers.length > 0 && (
                    <div className="glass-input rounded-xl p-2 max-h-32 overflow-y-auto">
                      {filteredCustomers.slice(0, 5).map((customer) => (
                        <div
                          key={customer.id}
                          className="flex items-center space-x-2 p-2 hover:bg-accent rounded-lg cursor-pointer"
                          onClick={() => {
                            setSelectedCustomer(customer.id);
                            form.setValue("customerId", customer.id);
                            setCustomerSearch(
                              `${customer.firstName} ${customer.lastName}`
                            );
                          }}
                          data-testid={`customer-option-${customer.id}`}>
                          <User className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {customer.firstName} {customer.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {customer.phone}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment Method - Cash Only */}
            {!showInvoiceOptions && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  {t("paymentMethod")}
                </Label>
                <div className="flex items-center space-x-2 p-3 glass-input rounded-xl bg-accent/50">
                  <Banknote className="w-5 h-5 text-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {t("cash")}
                  </span>
                </div>
              </div>
            )}

            {/* Sale Summary - Only show if invoice options are not displayed */}
            {!showInvoiceOptions && (
              <>
                <div className="glass-input rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("subtotal")}:
                    </span>
                    <span className="font-mono text-foreground">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("tax")} ({getDefaultTaxRate()}%):
                    </span>
                    <span className="font-mono text-foreground">
                      {formatCurrency(tax)}
                    </span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <div className="flex justify-between text-lg font-semibold">
                      <span className="text-foreground">{t("total")}:</span>
                      <span className="font-mono text-primary">
                        {formatCurrency(totalWithTax)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-4">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      createSaleMutation.isPending || saleItems.length === 0
                    }
                    data-testid="button-complete-sale">
                    {createSaleMutation.isPending
                      ? t("loading")
                      : t("completeSale")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleClose}
                    data-testid="button-cancel">
                    {t("cancel")}
                  </Button>
                </div>
              </>
            )}
          </form>
          </div>
        </div>
      </DialogContent>

      {/* Variant Selection Modal */}
      {selectedProductForVariant && (
        <VariantSelectionModal
          isOpen={showVariantModal}
          onClose={handleCloseVariantModal}
          product={selectedProductForVariant}
          variants={productVariants}
          onSelect={handleVariantSelected}
          isEditing={!!editingVariantItem}
          currentVariantId={editingVariantItem?.variantId}
        />
      )}
    </Dialog>
  );
};
