import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertUserSchema, type InsertUser, type Role, type Service, type Specialty, type User } from "@shared/schema";
import { StaffForm } from "./StaffForm";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function StaffDetails() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: staffId } = useParams<{ id: string }>();
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const member = staffList.find((m) => m.id === staffId);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/roles/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const { data: specialties = [] } = useQuery<Specialty[]>({
    queryKey: ["/api/specialties", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "", password: "", firstName: "", lastName: "", email: "",
      role: "", tenantId: currentTenant?.id || "", isActive: true,
      service: "", specialty: "",
    },
  });

  useEffect(() => {
    if (member && !initialized) {
      form.reset({
        username: member.username, password: "", firstName: member.firstName, lastName: member.lastName,
        email: member.email || "", role: member.role, tenantId: member.tenantId || currentTenant?.id || "",
        isActive: member.isActive, service: member.service || "", specialty: member.specialty || "",
      });
      setInitialized(true);
    }
  }, [member, initialized, form, currentTenant?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      const submitData = data.password ? data : (({ password, ...rest }) => rest)(data);
      const response = await offlineApiRequest("PUT", `/api/staff/${staffId}`, submitData, { collection: "staff", entityId: staffId });
      const saved = await response.json();
      if (pendingPhoto) {
        const photoBase64 = await fileToBase64(pendingPhoto);
        await offlineApiRequest(
          "PUT",
          `/api/staff/${staffId}/photo`,
          { photoBase64, contentType: pendingPhoto.type === "image/png" ? "image/png" : "image/jpeg" },
          { collection: "staff", entityId: staffId }
        );
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: t("success"), description: t("staffUpdatedSuccessfully") });
      setLocation("/staff");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveStaff"), t("networkRequestFailed"));
    },
  });

  if (!member) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="staff-show-page">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => setLocation("/staff")}>{t("staff")}</Button>
        <span>›</span>
        <span className="font-medium text-primary">{member.firstName} {member.lastName}</span>
      </div>
      <h1 className="text-2xl font-display font-bold text-foreground">{t("editStaffMember")}</h1>

      <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6" data-testid="form-staff-edit">
        <StaffForm form={form} roles={roles} services={services} specialties={specialties} isEditing matricule={member.matricule} pendingPhoto={pendingPhoto} onPhotoSelected={setPendingPhoto} />
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
