import React, { useState } from "react";
import {
  Plus,
  Search,
  Edit,
  UserCheck,
  Shield,
  User,
  Crown,
  Trash2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { usePolicy } from "@/hooks/usePolicy";
import { StaffPolicy } from "@/lib/policies/staff.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { useOfflineDeleteMutation } from "@/hooks/useOfflineDeleteMutation";
import { showApiErrorToast } from "@/lib/errorHandler";
import { getInstallMode } from "@/lib/installMode";
import {
  createLocalAccount,
  LastAdminProtectedError,
  listLocalAccounts,
  setLocalAccountRoleAndActive,
} from "@/lib/localAccountsStore";
import { toPublicLocalUser } from "@/lib/localAuth";
import { RecoveryCodeDisplay } from "@/components/RecoveryCodeDisplay";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Staff() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const staffPolicy = usePolicy(StaffPolicy);
  const installMode = getInstallMode();
  const [localRecoveryCode, setLocalRecoveryCode] = useState<string | null>(
    null
  );
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      firstName: "",
      lastName: "",
      email: "",
      role: "cashier",
      tenantId: currentTenant?.id || "",
      isActive: true,
      service: "",
      specialty: "",
      matricule: "",
      fonction: "",
    },
  });

  // Fetch staff members
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["/api/staff", currentTenant?.id, installMode],
    enabled: installMode === "local" ? true : !!currentTenant?.id,
    queryFn:
      installMode === "local"
        ? async () => (await listLocalAccounts()).map(toPublicLocalUser)
        : undefined,
  });

  // Create/Update staff mutation
  const saveStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      if (installMode === "local") {
        if (editingStaff) {
          await setLocalAccountRoleAndActive({
            id: editingStaff.id,
            role: data.role,
          });
          return {};
        }
        const result = await createLocalAccount({
          username: data.username,
          password: data.password,
          role: data.role,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
        });
        setLocalRecoveryCode(result.recoveryCode);
        return {};
      }

      const method = editingStaff ? "PUT" : "POST";
      const url = editingStaff ? `/api/staff/${editingStaff.id}` : "/api/staff";

      const response = await offlineApiRequest(
        method,
        url,
        {
          ...data,
          tenantId: currentTenant?.id,
        },
        { collection: "staff" }
      );

      const saved = await response.json();
      if (pendingPhoto && saved?.id) {
        const photoBase64 = await fileToBase64(pendingPhoto);
        await offlineApiRequest(
          "PUT",
          `/api/staff/${saved.id}/photo`,
          { photoBase64, contentType: pendingPhoto.type === "image/png" ? "image/png" : "image/jpeg" },
          { collection: "staff", entityId: saved.id }
        );
        setPendingPhoto(null);
      }
      return saved;
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("staffSavedOffline")
          : editingStaff
          ? t("staffUpdatedSuccessfully")
          : t("staffCreatedSuccessfully"),
      });
      handleCloseModal(); // Always close modal after success
    },
    onError: (error: unknown) => {
      if (error instanceof LastAdminProtectedError) {
        toast({
          title: t("error"),
          description: t("lastAdminProtected"),
          variant: "destructive",
        });
        return;
      }
      if (error instanceof Error && error.message === "username_taken") {
        toast({
          title: t("error"),
          description: t("usernameTaken"),
          variant: "destructive",
        });
        return;
      }
      if (error instanceof Error && error.message === "password_too_short") {
        toast({
          title: t("error"),
          description: t("passwordMinLength"),
          variant: "destructive",
        });
        return;
      }
      void showApiErrorToast(
        toast,
        error,
        t("error"),
        t("failedToSaveStaff"),
        t("networkRequestFailed")
      );
    },
  });

  // Deactivate local account mutation (local mode's equivalent of delete)
  const deactivateLocalAccountMutation = useMutation({
    mutationFn: (id: string) =>
      setLocalAccountRoleAndActive({ id, active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: t("success"),
        description: t("staffDeletedSuccessfully"),
      });
    },
    onError: (error: unknown) => {
      if (error instanceof LastAdminProtectedError) {
        toast({
          title: t("error"),
          description: t("lastAdminProtected"),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t("error"),
        description: t("failedToDeleteStaff"),
        variant: "destructive",
      });
    },
  });

  // Delete staff mutation
  const deleteStaffMutation = useOfflineDeleteMutation({
    collection: "staff",
    queryKey: ["/api/staff"],
    entityUrl: (staffId) => `/api/staff/${staffId}`,
    messages: {
      online: t("staffDeletedSuccessfully"),
      queued: t("staffDeleteQueuedOffline"),
      error: t("failedToDeleteStaff"),
      successTitle: t("success"),
      queuedTitle: t("savedOffline"),
      errorTitle: t("error"),
      networkError: t("networkRequestFailed"),
    },
  });

  const handleCloseModal = () => {
    setShowStaffModal(false);
    setEditingStaff(null);
    setPendingPhoto(null);
    form.reset({
      username: "",
      password: "",
      firstName: "",
      lastName: "",
      email: "",
      role: "cashier",
      tenantId: currentTenant?.id || "",
      isActive: true,
      service: "",
      specialty: "",
      matricule: "",
      fonction: "",
    });
  };

  const handleEditStaff = (member: any) => {
    setEditingStaff(member);
    form.reset({
      username: member.username,
      password: "", // Don't populate password for security
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email || "",
      role: member.role,
      tenantId: member.tenantId || currentTenant?.id || "", // Ensure tenantId is always set
      isActive: member.isActive,
      service: member.service || "",
      specialty: member.specialty || "",
      matricule: member.matricule || "",
      fonction: member.fonction || "",
    });
    setShowStaffModal(true);
  };

  const onSubmit = (data: InsertUser) => {
    // Remove password if editing and no new password provided
    let submitData: any = { ...data };
    if (editingStaff && !data.password) {
      const { password, ...dataWithoutPassword } = data;
      submitData = dataWithoutPassword;
    }

    saveStaffMutation.mutate(submitData);
  };

  const handleDeleteStaff = (member: any) => {
    if (
      window.confirm(
        `${t("confirmDeleteStaff")} ${member.firstName} ${member.lastName} ?`
      )
    ) {
      if (installMode === "local") {
        deactivateLocalAccountMutation.mutate(member.id);
      } else {
        deleteStaffMutation.mutate(member.id);
      }
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return Crown;
      case "manager":
        return Shield;
      default:
        return UserCheck;
    }
  };

  const getRoleBadge = (role: string) => {
    const config = {
      admin: { label: t("admin"), variant: "destructive" as const },
      manager: { label: t("manager"), variant: "default" as const },
      cashier: { label: t("cashier"), variant: "secondary" as const },
      accueil: { label: t("accueil"), variant: "secondary" as const },
      infirmier: { label: t("infirmier"), variant: "secondary" as const },
      medecin: { label: t("medecin"), variant: "default" as const },
      laboratoire: { label: t("laboratoire"), variant: "secondary" as const },
      pharmacien: { label: t("pharmacien"), variant: "secondary" as const },
    };

    const { label, variant } =
      config[role as keyof typeof config] || config.cashier;
    return <Badge variant={variant}>{label}</Badge>;
  };

  const filteredStaff = (staff as any[]).filter((member: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
    return (
      fullName.includes(query) ||
      member.username.toLowerCase().includes(query) ||
      member.email?.toLowerCase().includes(query)
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
    <div className="space-y-6" data-testid="staff-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("staff")}
        </h1>
        <PolicyGuard policy={StaffPolicy} action="canCreate">
          <Button
            onClick={() => {
              setEditingStaff(null);
              setShowStaffModal(true);
            }}
            data-testid="button-add-staff">
            <Plus className="w-4 h-4 mr-2" />
            {t("addStaffMember")}
          </Button>
        </PolicyGuard>
      </div>

      {/* Search */}
      <div className="glass-card rounded-xl p-6">
        <div className="relative">
          <Input
            placeholder={t("searchStaffPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input rounded-xl pl-10"
            data-testid="input-search-staff"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Staff Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-foreground">{t("staffMember")}</TableHead>
              <TableHead className="text-foreground">{t("username")}</TableHead>
              <TableHead className="text-foreground">{t("email")}</TableHead>
              <TableHead className="text-foreground">{t("role")}</TableHead>
              <TableHead className="text-foreground">{t("status")}</TableHead>
              <TableHead className="text-foreground">{t("joined")}</TableHead>
              <TableHead className="text-foreground text-right">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStaff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex flex-col items-center space-y-2">
                    <UserCheck className="w-12 h-12 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? t("noStaffMembersMatchSearch")
                        : t("noStaffMembersFound")}
                    </p>
                    {!searchQuery && (
                      <Button
                        variant="outline"
                        onClick={() => setShowStaffModal(true)}
                        className="mt-2">
                        <Plus className="w-4 h-4 mr-2" />
                        {t("addFirstStaffMember")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredStaff.map((member: any) => {
                const RoleIcon = getRoleIcon(member.role);

                return (
                  <TableRow
                    key={member.id}
                    className="border-border"
                    data-testid={`staff-row-${member.id}`}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-primary to-chart-5 rounded-xl flex items-center justify-center">
                          <span className="text-primary-foreground font-semibold text-sm">
                            {member.firstName[0]}
                            {member.lastName[0]}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {member.firstName} {member.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            ID: {member.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-foreground">
                        {member.username}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {member.email || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <RoleIcon className="w-4 h-4 text-muted-foreground" />
                        {getRoleBadge(member.role)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={member.isActive ? "default" : "secondary"}>
                        {member.isActive ? t("active") : t("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center space-x-2 justify-end">
                        <PolicyGuard policy={StaffPolicy} action="canUpdate">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditStaff(member)}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid={`button-edit-${member.id}`}
                            title={t("editStaffMember")}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </PolicyGuard>
                        <PolicyGuard policy={StaffPolicy} action="canDelete">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteStaff(member)}
                            className="text-muted-foreground hover:text-red-500"
                            data-testid={`button-delete-${member.id}`}
                            title={t("deleteStaffMember")}>
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

      {/* Staff Modal */}
      <Dialog open={showStaffModal} onOpenChange={handleCloseModal}>
        <DialogContent
          className="glass-card max-w-lg max-h-[90vh] overflow-y-auto"
          data-testid="staff-modal">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">
              {editingStaff ? t("editStaffMember") : t("addNewStaffMember")}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-staff">
            {/* Hidden field for tenantId */}
            <input type="hidden" {...form.register("tenantId")} />
            {!(installMode === "local" && editingStaff) && (
              <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="firstName"
                  className="text-sm font-medium text-foreground">
                  {t("firstName")}
                </Label>
                <Input
                  id="firstName"
                  {...form.register("firstName")}
                  className="glass-input rounded-xl"
                  placeholder="John"
                  data-testid="input-first-name"
                />
                {form.formState.errors.firstName && (
                  <p className="text-sm text-chart-2">
                    {form.formState.errors.firstName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="lastName"
                  className="text-sm font-medium text-foreground">
                  {t("lastName")}
                </Label>
                <Input
                  id="lastName"
                  {...form.register("lastName")}
                  className="glass-input rounded-xl"
                  placeholder="Doe"
                  data-testid="input-last-name"
                />
                {form.formState.errors.lastName && (
                  <p className="text-sm text-chart-2">
                    {form.formState.errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="text-sm font-medium text-foreground">
                {t("username")}
              </Label>
              <Input
                id="username"
                {...form.register("username")}
                className="glass-input rounded-xl"
                placeholder="johndoe"
                data-testid="input-username"
              />
              {form.formState.errors.username && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-foreground">
                {t("password")}{" "}
                {editingStaff && (
                  <span className="text-muted-foreground">
                    ({t("leaveBlankToKeepCurrent")})
                  </span>
                )}
              </Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
                className="glass-input rounded-xl"
                placeholder={
                  editingStaff ? t("leaveBlankToKeepCurrent") : t("password")
                }
                data-testid="input-password"
              />
              {form.formState.errors.password && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-foreground">
                {t("email")}
              </Label>
              <Input
                id="email"
                type="email"
                required
                {...form.register("email")}
                className="glass-input rounded-xl"
                placeholder="john.doe@example.com"
                data-testid="input-email"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="service" className="text-sm font-medium text-foreground">
                  {t("staffService")}
                </Label>
                <Input id="service" {...form.register("service")} className="glass-input rounded-xl" data-testid="input-service" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty" className="text-sm font-medium text-foreground">
                  {t("staffSpecialty")}
                </Label>
                <Input id="specialty" {...form.register("specialty")} className="glass-input rounded-xl" data-testid="input-specialty" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="matricule" className="text-sm font-medium text-foreground">
                  {t("staffMatricule")}
                </Label>
                <Input id="matricule" {...form.register("matricule")} className="glass-input rounded-xl" data-testid="input-matricule" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fonction" className="text-sm font-medium text-foreground">
                  {t("staffFonction")}
                </Label>
                <Input id="fonction" {...form.register("fonction")} className="glass-input rounded-xl" data-testid="input-fonction" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("uploadPhoto")}</Label>
              <label className="glass-input rounded-xl h-24 flex flex-col items-center justify-center gap-1 cursor-pointer text-sm text-muted-foreground">
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && setPendingPhoto(e.target.files[0])}
                />
                <span>{pendingPhoto ? pendingPhoto.name : t("dragDropPhoto")}</span>
              </label>
            </div>
              </>
            )}
            {installMode === "local" && editingStaff && (
              <p className="text-xs text-muted-foreground">
                {t("localEditRoleOnlyNotice")}
              </p>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t("role")}
              </Label>
              <Select
                value={form.watch("role")}
                onValueChange={(value: any) => {
                  form.setValue("role", value);
                  form.trigger("role"); // Trigger validation for this field
                }}>
                <SelectTrigger
                  className="glass-input rounded-xl"
                  data-testid="select-role">
                  <SelectValue placeholder={t("selectRole")} />
                </SelectTrigger>
                <SelectContent className="glass-card border-border">
                  <SelectItem value="cashier">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("cashier")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4" />
                      <span>{t("manager")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center space-x-2">
                      <Crown className="w-4 h-4" />
                      <span>{t("admin")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="accueil">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("accueil")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="infirmier">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("infirmier")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="medecin">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4" />
                      <span>{t("medecin")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="laboratoire">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("laboratoire")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pharmacien">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("pharmacien")}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.role && (
                <p className="text-sm text-chart-2">
                  {form.formState.errors.role.message}
                </p>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                data-testid="button-cancel">
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={saveStaffMutation.isPending}
                data-testid="button-save-staff">
                {saveStaffMutation.isPending
                  ? t("loading")
                  : t("saveStaffMember")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={localRecoveryCode !== null}
        onOpenChange={() => {
          /* Only the explicit "continue" button below closes this - the
             code is shown once and must not be dismissed by an accidental
             outside click or Escape press. */
        }}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t("recoveryCodeTitle")}</DialogTitle>
          </DialogHeader>
          {localRecoveryCode && (
            <RecoveryCodeDisplay
              recoveryCode={localRecoveryCode}
              onContinue={() => setLocalRecoveryCode(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
