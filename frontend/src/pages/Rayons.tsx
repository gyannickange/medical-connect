import React, { useState } from "react";
import { Plus, Search, Edit, LayoutGrid } from "lucide-react";
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
import { insertRayonSchema, type InsertRayon } from "@shared/schema";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { RayonsPolicy } from "@/lib/policies/rayons.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { showApiErrorToast } from "@/lib/errorHandler";

export default function Rayons() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRayonModal, setShowRayonModal] = useState(false);
  const [editingRayon, setEditingRayon] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const form = useForm<InsertRayon>({
    resolver: zodResolver(insertRayonSchema),
    defaultValues: {
      name: "",
      description: "",
      tenantId: currentTenant?.id || "",
    },
  });

  const { data: rayons = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/rayons", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const saveRayonMutation = useMutation({
    mutationFn: async (data: InsertRayon) => {
      const method = editingRayon ? "PUT" : "POST";
      const url = editingRayon ? `/api/rayons/${editingRayon.id}` : "/api/rayons";
      const response = await offlineApiRequest(
        method,
        url,
        { ...data, tenantId: currentTenant?.id },
        { collection: "rayons" }
      );
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/rayons"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("rayonSavedOffline")
          : editingRayon
          ? t("rayonUpdatedSuccessfully")
          : t("rayonCreatedSuccessfully"),
      });
      handleCloseModal();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(
        toast,
        error,
        t("error"),
        editingRayon ? t("failedToUpdateRayon") : t("failedToCreateRayon"),
        t("networkRequestFailed")
      );
    },
  });

  const handleCloseModal = () => {
    setShowRayonModal(false);
    setEditingRayon(null);
    form.reset({ name: "", description: "", tenantId: currentTenant?.id || "" });
  };

  const handleEditRayon = (rayon: any) => {
    setEditingRayon(rayon);
    form.reset({
      name: rayon.name,
      description: rayon.description || "",
      tenantId: rayon.tenantId,
    });
    setShowRayonModal(true);
  };

  const onSubmit = (data: InsertRayon) => {
    saveRayonMutation.mutate(data);
  };

  const filteredRayons = rayons.filter((rayon: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      rayon.name?.toLowerCase().includes(query) ||
      rayon.description?.toLowerCase().includes(query)
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
    <div className="space-y-6" data-testid="rayons-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("rayons")}
        </h1>
        <PolicyGuard policy={RayonsPolicy} action="canCreate">
          <Button
            className="btn-primary"
            onClick={() => {
              setEditingRayon(null);
              setShowRayonModal(true);
            }}
            data-testid="button-add-rayon">
            <Plus className="w-4 h-4 mr-2" />
            {t("addRayon")}
          </Button>
        </PolicyGuard>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="relative">
          <Input
            placeholder={t("searchRayonsPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input rounded-xl pl-10"
            data-testid="input-search-rayons"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-foreground font-semibold">
                {t("rayonName")}
              </TableHead>
              <TableHead className="text-foreground font-semibold">
                {t("description")}
              </TableHead>
              <TableHead className="text-right text-foreground font-semibold">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRayons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? t("noRayonsMatchSearch") : t("addFirstRayon")}
                </TableCell>
              </TableRow>
            ) : (
              filteredRayons.map((rayon: any) => (
                <TableRow
                  key={rayon.id}
                  className="border-border hover:bg-accent/50 transition-colors">
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                      {rayon.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {rayon.description || t("noDescription")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <PolicyGuard policy={RayonsPolicy} action="canUpdate">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditRayon(rayon)}
                          className="hover:bg-accent"
                          data-testid={`button-edit-rayon-${rayon.id}`}>
                          <Edit className="w-4 h-4" />
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

      <Dialog open={showRayonModal} onOpenChange={handleCloseModal}>
        <DialogContent className="glass-card max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">
              {editingRayon ? t("editRayon") : t("createRayon")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="name">{t("rayonName")}</Label>
              <Input
                id="name"
                placeholder={t("enterRayonName")}
                {...form.register("name")}
                className="glass-input"
                data-testid="input-rayon-name"
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
                placeholder={t("rayonDescription")}
                {...form.register("description")}
                className="glass-input"
                data-testid="input-rayon-description"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                data-testid="button-cancel-rayon">
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                className="btn-primary"
                disabled={saveRayonMutation.isPending}
                data-testid="button-save-rayon">
                {saveRayonMutation.isPending
                  ? t("saving")
                  : editingRayon
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
