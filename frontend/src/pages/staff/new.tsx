import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertUserSchema, type InsertUser, type Role } from "@shared/schema";
import { StaffForm } from "./StaffForm";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function NewStaff() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/roles/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "", password: "", firstName: "", lastName: "", email: "",
      role: "", tenantId: currentTenant?.id || "", isActive: true,
      service: "", specialty: "", matricule: "", fonction: "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      const response = await offlineApiRequest("POST", "/api/staff", { ...data, tenantId: currentTenant?.id }, { collection: "staff" });
      const saved = await response.json();
      if (pendingPhoto && saved?.id) {
        const photoBase64 = await fileToBase64(pendingPhoto);
        await offlineApiRequest(
          "PUT",
          `/api/staff/${saved.id}/photo`,
          { photoBase64, contentType: pendingPhoto.type === "image/png" ? "image/png" : "image/jpeg" },
          { collection: "staff", entityId: saved.id }
        );
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: t("success"), description: t("staffCreatedSuccessfully") });
      setLocation("/staff");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveStaff"), t("networkRequestFailed"));
    },
  });

  return (
    <div className="space-y-6" data-testid="staff-new-page">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => setLocation("/staff")}>{t("staff")}</Button>
        <span>›</span>
        <span className="font-medium text-primary">{t("addNewStaffMember")}</span>
      </div>
      <h1 className="text-2xl font-display font-bold text-foreground">{t("addNewStaffMember")}</h1>

      <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6" data-testid="form-staff-new">
        <StaffForm form={form} roles={roles} isEditing={false} pendingPhoto={pendingPhoto} onPhotoSelected={setPendingPhoto} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => setLocation("/staff")}>{t("cancel")}</Button>
          <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-staff">
            {saveMutation.isPending ? t("loading") : t("saveStaffMember")}
          </Button>
        </div>
      </form>
    </div>
  );
}
