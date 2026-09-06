import React from "react";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";
import type { InsertUser, Role } from "@shared/schema";

export function StaffForm({
  form,
  roles,
  isEditing,
  pendingPhoto,
  onPhotoSelected,
}: {
  form: UseFormReturn<InsertUser>;
  roles: Role[];
  isEditing: boolean;
  pendingPhoto: File | null;
  onPhotoSelected: (file: File) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-bold text-foreground">{t("personalInformationTitle")}</h2>
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("firstName")} *</Label>
          <Input id="firstName" {...form.register("firstName")} data-testid="input-first-name" />
          {form.formState.errors.firstName && <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t("lastName")} *</Label>
          <Input id="lastName" {...form.register("lastName")} data-testid="input-last-name" />
          {form.formState.errors.lastName && <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")} *</Label>
          <Input id="email" type="email" {...form.register("email")} data-testid="input-email" />
          {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">{t("username")}</Label>
          <Input id="username" {...form.register("username")} data-testid="input-username" />
          {form.formState.errors.username && <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">
            {t("password")} {isEditing && <span className="text-muted-foreground">({t("leaveBlankToKeepCurrent")})</span>}
          </Label>
          <Input id="password" type="password" {...form.register("password")} data-testid="input-password" />
        </div>
        <div className="space-y-2">
          <Label>{t("uploadPhoto")}</Label>
          <label className="rounded-xl border border-dashed border-border h-24 flex flex-col items-center justify-center gap-1 cursor-pointer text-sm text-muted-foreground">
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onPhotoSelected(e.target.files[0])}
            />
            <span>{pendingPhoto ? pendingPhoto.name : t("dragDropPhoto")}</span>
          </label>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-bold text-foreground">{t("professionalInformationTitle")}</h2>
        <div className="space-y-2">
          <Label>{t("role")} *</Label>
          <Select value={form.watch("role") ?? ""} onValueChange={(value) => form.setValue("role", value)}>
            <SelectTrigger data-testid="select-role">
              <SelectValue placeholder={t("selectRole")} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.role && <p className="text-sm text-destructive">{form.formState.errors.role.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="service">{t("staffService")}</Label>
          <Input id="service" {...form.register("service")} data-testid="input-service" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="specialty">{t("staffSpecialty")}</Label>
          <Input id="specialty" {...form.register("specialty")} data-testid="input-specialty" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="matricule">{t("staffMatricule")}</Label>
          <Input id="matricule" {...form.register("matricule")} data-testid="input-matricule" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fonction">{t("staffFonction")}</Label>
          <Input id="fonction" {...form.register("fonction")} data-testid="input-fonction" />
        </div>
      </div>
    </div>
  );
}
