import React, { useState } from "react";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  FolderTree,
  FolderOpen,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { insertCategorySchema, type InsertCategory } from "@shared/schema";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { usePolicy } from "@/hooks/usePolicy";
import { CategoriesPolicy } from "@/lib/policies/categories.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { useOfflineDeleteMutation } from "@/hooks/useOfflineDeleteMutation";
import { showApiErrorToast } from "@/lib/errorHandler";

export default function Categories() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const categoriesPolicy = usePolicy(CategoriesPolicy);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const form = useForm<InsertCategory>({
    resolver: zodResolver(insertCategorySchema),
    defaultValues: {
      name: "",
      description: "",
      parentCategoryId: undefined,
      taxRate: 0.00,
      tenantId: currentTenant?.id || "",
      isDefault: false,
    },
  });

  // Fetch categories (with offline support)
  const { data: categories = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/categories", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  // Create/Update category mutation
  const saveCategoryMutation = useMutation({
    mutationFn: async (data: InsertCategory) => {
      const method = editingCategory ? "PUT" : "POST";
      const url = editingCategory
        ? `/api/categories/${editingCategory.id}`
        : "/api/categories";
      const response = await offlineApiRequest(
        method,
        url,
        {
          ...data,
          tenantId: currentTenant?.id,
          parentCategoryId: data.parentCategoryId || null,
        },
        { collection: "categories" }
      );
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("categorySavedOffline")
          : editingCategory
          ? t("categoryUpdatedSuccessfully")
          : t("categoryCreatedSuccessfully"),
      });
      handleCloseModal();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(
        toast,
        error,
        t("error"),
        editingCategory ? t("failedToUpdateCategory") : t("failedToCreateCategory"),
        t("networkRequestFailed")
      );
    },
  });

  // Delete category mutation (with offline support)
  const deleteCategoryMutation = useOfflineDeleteMutation({
    collection: "categories",
    queryKey: ["/api/categories"],
    entityUrl: (categoryId) => `/api/categories/${categoryId}`,
    messages: {
      online: t("categoryDeletedSuccessfully"),
      queued: t("categoryDeleteQueuedOffline"),
      error: t("failedToDeleteCategory"),
      successTitle: t("success"),
      queuedTitle: t("savedOffline"),
      errorTitle: t("error"),
      networkError: t("networkRequestFailed"),
    },
  });

  const handleCloseModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    form.reset({
      name: "",
      description: "",
      parentCategoryId: undefined,
      taxRate: 0.00,
      tenantId: currentTenant?.id || "",
      isDefault: false,
    });
  };

  const handleEditCategory = (category: any) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      description: category.description || "",
      parentCategoryId: category.parentCategoryId || undefined,
      taxRate: category.taxRate ? parseFloat(category.taxRate) : undefined,
      tenantId: category.tenantId,
      isDefault: category.isDefault || false,
    });
    setShowCategoryModal(true);
  };

  const onSubmit = (data: InsertCategory) => {
    saveCategoryMutation.mutate(data);
  };

  const handleDeleteCategory = (category: any) => {
    // Check if category has subcategories
    const hasSubcategories = categories.some(
      (cat: any) => cat.parentCategoryId === category.id
    );

    if (hasSubcategories) {
      toast({
        title: t("error"),
        description: t("cannotDeleteCategoryWithSubcategories"),
        variant: "destructive",
      });
      return;
    }

    if (window.confirm(t("confirmDeleteCategory"))) {
      deleteCategoryMutation.mutate(category.id);
    }
  };

  // Get parent category name
  const getParentCategoryName = (parentCategoryId: string | null) => {
    if (!parentCategoryId) return null;
    const parent = categories.find((cat: any) => cat.id === parentCategoryId);
    return parent?.name || null;
  };

  // Get available parent categories (exclude current category and its descendants)
  const getAvailableParentCategories = () => {
    if (!editingCategory) return categories;

    // Exclude the category being edited to prevent self-reference
    return categories.filter((cat: any) => cat.id !== editingCategory.id);
  };

  const filteredCategories = categories.filter((category: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      category.name?.toLowerCase().includes(query) ||
      category.description?.toLowerCase().includes(query)
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
    <div className="space-y-6" data-testid="categories-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("categories")}
        </h1>
        <PolicyGuard policy={CategoriesPolicy} action="canCreate">
          <Button
            onClick={() => {
              setEditingCategory(null);
              setShowCategoryModal(true);
            }}
            data-testid="button-add-category">
            <Plus className="w-4 h-4 mr-2" />
            {t("addCategory")}
          </Button>
        </PolicyGuard>
      </div>

      {/* Search */}
      <div className="glass-card rounded-xl p-6">
        <div className="relative">
          <Input
            placeholder={t("searchCategoriesPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input rounded-xl pl-10"
            data-testid="input-search-categories"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Categories Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-foreground font-semibold">
                {t("categoryName")}
              </TableHead>
              <TableHead className="text-foreground font-semibold">
                {t("description")}
              </TableHead>
              <TableHead className="text-foreground font-semibold">
                {t("parentCategory")}
              </TableHead>
              <TableHead className="text-foreground font-semibold">
                Tax Rate
              </TableHead>
              <TableHead className="text-right text-foreground font-semibold">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCategories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground">
                  {searchQuery
                    ? t("noCategoriesMatchSearch")
                    : t("addFirstCategory")}
                </TableCell>
              </TableRow>
            ) : (
              filteredCategories.map((category: any) => {
                const parentName = getParentCategoryName(
                  category.parentCategoryId
                );
                const hasSubcategories = categories.some(
                  (cat: any) => cat.parentCategoryId === category.id
                );

                return (
                  <TableRow
                    key={category.id}
                    className="border-border hover:bg-accent/50 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {hasSubcategories ? (
                          <FolderTree className="w-4 h-4 text-primary" />
                        ) : (
                          <FolderOpen className="w-4 h-4 text-muted-foreground" />
                        )}
                        {category.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {category.description || t("noDescription")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {parentName ? (
                        <span className="inline-flex items-center gap-1">
                          <FolderTree className="w-3 h-3" />
                          {parentName}
                        </span>
                      ) : (
                        <span className="text-xs italic">
                          {t("topLevelCategory")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {category.taxRate ? (
                        <span className="font-medium text-foreground">
                          {parseFloat(category.taxRate).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Default
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <PolicyGuard policy={CategoriesPolicy} action="canUpdate">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditCategory(category)}
                            className="hover:bg-accent"
                            data-testid={`button-edit-category-${category.id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </PolicyGuard>
                        <PolicyGuard policy={CategoriesPolicy} action="canDelete">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCategory(category)}
                            className="hover:bg-destructive/10 hover:text-destructive"
                            data-testid={`button-delete-category-${category.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </PolicyGuard>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Category Modal */}
      <Dialog open={showCategoryModal} onOpenChange={handleCloseModal}>
        <DialogContent className="glass-card max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">
              {editingCategory ? t("editCategory") : t("createCategory")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 mt-4">
            <div>
              <Label htmlFor="name">{t("categoryName")}</Label>
              <Input
                id="name"
                placeholder={t("enterCategoryName")}
                {...form.register("name")}
                className="glass-input"
                data-testid="input-category-name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">
                {t("description")} ({t("optional")})
              </Label>
              <Input
                id="description"
                placeholder={t("categoryDescription")}
                {...form.register("description")}
                className="glass-input"
                data-testid="input-category-description"
              />
            </div>

            <div>
              <Label htmlFor="parentCategoryId">
                {t("parentCategory")} ({t("optional")})
              </Label>
              <Select
                value={form.watch("parentCategoryId") || "none"}
                onValueChange={(value) =>
                  form.setValue(
                    "parentCategoryId",
                    value === "none" ? undefined : value
                  )
                }>
                <SelectTrigger className="glass-input">
                  <SelectValue placeholder={t("selectParentCategory")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noParentCategory")}</SelectItem>
                  {getAvailableParentCategories().map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="taxRate">{t("taxRate")} (%) ({t("optional")})</Label>
              <Input
                id="taxRate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder={t("leaveEmptyForDefaultTaxRate")}
                {...form.register("taxRate", { valueAsNumber: true })}
                className="glass-input"
                data-testid="input-category-tax-rate"
              />
              {form.formState.errors.taxRate && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.taxRate.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("defaultTaxRateDescription")}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                data-testid="button-cancel-category">
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={saveCategoryMutation.isPending}
                data-testid="button-save-category">
                {saveCategoryMutation.isPending
                  ? t("saving")
                  : editingCategory
                  ? t("update")
                  : t("create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
