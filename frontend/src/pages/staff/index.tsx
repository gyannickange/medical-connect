import React, { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Edit,
  UserCheck,
  Shield,
  Crown,
  Archive,
  ArchiveRestore,
  MoreVertical,
  ChartColumnBig,
  ShieldCheck,
  Building2,
  Stethoscope,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { insertUserSchema, type InsertUser, type Role, type Service } from "@shared/schema";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { usePolicy } from "@/hooks/usePolicy";
import { StaffPolicy } from "@/lib/policies/staff.policy";
import { ServicesPolicy } from "@/lib/policies/services.policy";
import { SpecialtiesPolicy } from "@/lib/policies/specialties.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
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
  const [, setLocation] = useLocation();
  const installMode = getInstallMode();
  const [localRecoveryCode, setLocalRecoveryCode] = useState<string | null>(
    null
  );
  const [showLocalAccountModal, setShowLocalAccountModal] = useState(false);
  const [editingLocalAccount, setEditingLocalAccount] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(0);

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

  // Fetch staff members. The local-mode queryFn key is only included when
  // actually in local mode — an explicit `queryFn: undefined` here would
  // override the QueryClient's default queryFn instead of falling back to it.
  const { data: staff = [], isLoading } = useQuery({
    queryKey:
      installMode === "local"
        ? ["/api/staff", "local"]
        : ["/api/staff", currentTenant?.id],
    enabled: installMode === "local" ? true : !!currentTenant?.id,
    ...(installMode === "local"
      ? { queryFn: async () => (await listLocalAccounts()).map(toPublicLocalUser) }
      : {}),
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles", currentTenant?.id],
    enabled: installMode !== "local" && !!currentTenant?.id,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", currentTenant?.id],
    enabled: installMode !== "local" && !!currentTenant?.id,
  });

  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));

  // Create/Update local account mutation (local device install mode only —
  // the online path lives at /staff/new and /staff/:id)
  const saveStaffMutation = useMutation({
    mutationFn: async (data: any): Promise<{ _savedOffline?: boolean }> => {
      if (editingLocalAccount) {
        await setLocalAccountRoleAndActive({
          id: editingLocalAccount.id,
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
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline
          ? t("staffSavedOffline")
          : editingLocalAccount
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

  // Archive/reactivate local account mutation (local mode never hard-deletes)
  const setLocalAccountActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setLocalAccountRoleAndActive({ id, active }),
    onSuccess: (_result, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: t("success"),
        description: active ? t("staffReactivatedSuccessfully") : t("staffArchivedSuccessfully"),
      });
    },
    onError: (error: unknown, { active }) => {
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
        description: active ? t("failedToReactivateStaff") : t("failedToArchiveStaff"),
        variant: "destructive",
      });
    },
  });

  // Archive/reactivate staff mutation (online mode) — staff members are
  // never hard-deleted, only toggled inactive/active via PUT /api/staff/:id.
  const setStaffActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const response = await offlineApiRequest("PUT", `/api/staff/${id}`, { isActive: active }, { collection: "staff", entityId: id });
      return response.json();
    },
    onSuccess: (_result, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: t("success"),
        description: active ? t("staffReactivatedSuccessfully") : t("staffArchivedSuccessfully"),
      });
    },
    onError: (error: unknown, { active }) => {
      void showApiErrorToast(
        toast,
        error,
        t("error"),
        active ? t("failedToReactivateStaff") : t("failedToArchiveStaff"),
        t("networkRequestFailed")
      );
    },
  });

  const handleCloseModal = () => {
    setShowLocalAccountModal(false);
    setEditingLocalAccount(null);
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
    setEditingLocalAccount(member);
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
    setShowLocalAccountModal(true);
  };

  const onSubmit = (data: InsertUser) => {
    // Remove password if editing and no new password provided
    let submitData: any = { ...data };
    if (editingLocalAccount && !data.password) {
      const { password, ...dataWithoutPassword } = data;
      submitData = dataWithoutPassword;
    }

    saveStaffMutation.mutate(submitData);
  };

  const handleToggleActive = (member: any) => {
    const nextActive = !member.isActive;
    const confirmText = nextActive ? t("confirmReactivateStaff") : t("confirmArchiveStaff");
    if (window.confirm(`${confirmText} ${member.firstName} ${member.lastName} ?`)) {
      if (installMode === "local") {
        setLocalAccountActiveMutation.mutate({ id: member.id, active: nextActive });
      } else {
        setStaffActiveMutation.mutate({ id: member.id, active: nextActive });
      }
    }
  };

  const roleLabel = (role: string) => roleNameById.get(role) ?? role;

  const activeServices = services.filter((service) => service.isActive);

  const filteredStaff = (staff as any[]).filter((member: any) => {
    if (roleFilter !== "all" && member.role !== roleFilter) return false;
    if (serviceFilter !== "all" && member.service !== serviceFilter) return false;
    if (statusFilter !== "all" && (statusFilter === "active") !== member.isActive) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
    return (
      fullName.includes(query) ||
      member.username.toLowerCase().includes(query) ||
      member.email?.toLowerCase().includes(query)
    );
  });

  const PAGE_SIZE = 25;
  const pageStart = page * PAGE_SIZE;
  const pagedStaff = filteredStaff.slice(pageStart, pageStart + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const activeCount = (staff as any[]).filter((member) => member.isActive).length;
  const suspendedCount = (staff as any[]).filter((member) => !member.isActive).length;

  useEffect(() => {
    setPage(0);
  }, [searchQuery, roleFilter, serviceFilter, statusFilter]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            {t("staff")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("staffPageSubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PolicyGuard policy={ServicesPolicy} action="canView">
            <Button
              variant="outline"
              onClick={() => setLocation("/settings/services")}
              data-testid="button-manage-services-from-staff">
              <Building2 className="w-4 h-4 mr-2" />
              {t("servicesNavLabel")}
            </Button>
          </PolicyGuard>
          <PolicyGuard policy={SpecialtiesPolicy} action="canView">
            <Button
              variant="outline"
              onClick={() => setLocation("/settings/specialties")}
              data-testid="button-manage-specialties-from-staff">
              <Stethoscope className="w-4 h-4 mr-2" />
              {t("specialtiesNavLabel")}
            </Button>
          </PolicyGuard>
          <PolicyGuard policy={StaffPolicy} action="canCreate">
            <Button
              onClick={() => {
                if (installMode === "local") {
                  setEditingLocalAccount(null);
                  setShowLocalAccountModal(true);
                } else {
                  setLocation("/staff/new");
                }
              }}
              data-testid="button-add-staff">
              <Plus className="w-4 h-4 mr-2" />
              {t("addStaffMember")}
            </Button>
          </PolicyGuard>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center shrink-0">
            <ChartColumnBig className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{activeCount}</p>
            <p className="text-sm text-muted-foreground">{t("activeUsersStatLabel")}</p>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
            <ChartColumnBig className="w-5 h-5 text-warning" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{suspendedCount}</p>
            <p className="text-sm text-muted-foreground">{t("suspendedStatLabel")}</p>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{roles.length}</p>
            <p className="text-sm text-muted-foreground">{t("rolesDefinedStatLabel")}</p>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{services.length}</p>
            <p className="text-sm text-muted-foreground">{t("servicesStatLabel")}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
          <Input
            placeholder={t("searchStaffPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg pl-10"
            data-testid="input-search-staff"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-auto rounded-lg" data-testid="select-filter-role">
            <span className="text-muted-foreground mr-1">{t("roleFilterLabel")}</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allLabel")}</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-full sm:w-auto rounded-lg" data-testid="select-filter-service">
            <span className="text-muted-foreground mr-1">{t("staffService")}:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allLabel")}</SelectItem>
            {activeServices.map((service) => (
              <SelectItem key={service.id} value={service.name}>{service.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "inactive")}>
          <SelectTrigger className="w-full sm:w-auto rounded-lg" data-testid="select-filter-status">
            <span className="text-muted-foreground mr-1">{t("statusFilterLabelShort")}</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allLabel")}</SelectItem>
            <SelectItem value="active">{t("active")}</SelectItem>
            <SelectItem value="inactive">{t("inactive")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Staff Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-foreground">{t("staffMember")}</TableHead>
              <TableHead className="text-foreground">{t("role")}</TableHead>
              <TableHead className="text-foreground">{t("staffService")}</TableHead>
              <TableHead className="text-foreground">{t("staffSpecialty")}</TableHead>
              <TableHead className="text-foreground">{t("status")}</TableHead>
              <TableHead className="text-foreground text-right">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStaff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
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
                        onClick={() => {
                          if (installMode === "local") {
                            setEditingLocalAccount(null);
                            setShowLocalAccountModal(true);
                          } else {
                            setLocation("/staff/new");
                          }
                        }}
                        className="mt-2">
                        <Plus className="w-4 h-4 mr-2" />
                        {t("addFirstStaffMember")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pagedStaff.map((member: any) => (
                  <TableRow
                    key={member.id}
                    className="border-border"
                    data-testid={`staff-row-${member.id}`}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-primary font-semibold text-xs">
                            {member.firstName[0]}
                            {member.lastName[0]}
                          </span>
                        </div>
                        <p className="font-medium text-foreground whitespace-nowrap">
                          {member.firstName} {member.lastName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground">{roleLabel(member.role)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground">{member.service || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{member.specialty || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.isActive ? "success" : "warning"}>
                        {member.isActive ? t("active") : t("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center space-x-1 justify-end">
                        <PolicyGuard policy={StaffPolicy} action="canUpdate">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (installMode === "local") {
                                handleEditStaff(member);
                              } else {
                                setLocation(`/staff/${member.id}`);
                              }
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid={`button-edit-${member.id}`}
                            title={t("editStaffMember")}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </PolicyGuard>
                        <PolicyGuard policy={StaffPolicy} action="canDelete">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground"
                                data-testid={`button-more-${member.id}`}>
                                <MoreVertical className="w-4 h-4" />
                                <span className="sr-only">{t("moreOptionsLabel")}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleToggleActive(member)}
                                data-testid={`button-toggle-active-${member.id}`}>
                                {member.isActive ? (
                                  <>
                                    <Archive className="w-4 h-4 mr-2" />
                                    {t("archiveStaffMember")}
                                  </>
                                ) : (
                                  <>
                                    <ArchiveRestore className="w-4 h-4 mr-2" />
                                    {t("reactivateStaffMember")}
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </PolicyGuard>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
        {filteredStaff.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 bg-muted/40">
            <p className="text-sm text-muted-foreground">
              {t("resultsCount")
                .replace("{start}", String(pageStart + 1))
                .replace("{end}", String(Math.min(pageStart + PAGE_SIZE, filteredStaff.length)))
                .replace("{total}", String(filteredStaff.length))}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                data-testid="button-staff-prev-page">
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                data-testid="button-staff-next-page">
                {t("next")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Staff Modal */}
      <Dialog open={showLocalAccountModal} onOpenChange={handleCloseModal}>
        <DialogContent
          className="glass-card max-w-lg max-h-[90vh] overflow-y-auto"
          data-testid="staff-modal">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">
              {editingLocalAccount ? t("editStaffMember") : t("addNewStaffMember")}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-staff">
            {/* Hidden field for tenantId */}
            <input type="hidden" {...form.register("tenantId")} />
            {!(installMode === "local" && editingLocalAccount) && (
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
                  className="rounded-xl"
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
                  className="rounded-xl"
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
                className="rounded-xl"
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
                {editingLocalAccount && (
                  <span className="text-muted-foreground">
                    ({t("leaveBlankToKeepCurrent")})
                  </span>
                )}
              </Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
                className="rounded-xl"
                placeholder={
                  editingLocalAccount ? t("leaveBlankToKeepCurrent") : t("password")
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
                className="rounded-xl"
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
                <Input id="service" {...form.register("service")} className="rounded-xl" data-testid="input-service" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty" className="text-sm font-medium text-foreground">
                  {t("staffSpecialty")}
                </Label>
                <Input id="specialty" {...form.register("specialty")} className="rounded-xl" data-testid="input-specialty" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="matricule" className="text-sm font-medium text-foreground">
                  {t("staffMatricule")}
                </Label>
                <Input id="matricule" {...form.register("matricule")} className="rounded-xl" data-testid="input-matricule" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fonction" className="text-sm font-medium text-foreground">
                  {t("staffFonction")}
                </Label>
                <Input id="fonction" {...form.register("fonction")} className="rounded-xl" data-testid="input-fonction" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("uploadPhoto")}</Label>
              <label className="rounded-xl h-24 flex flex-col items-center justify-center gap-1 cursor-pointer text-sm text-muted-foreground">
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
            {installMode === "local" && editingLocalAccount && (
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
                  className="rounded-xl"
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
