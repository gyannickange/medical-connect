import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { PermissionModule, Role } from "@shared/schema";
import { cn } from "@/lib/utils";

export type RoleWithUserCount = Role & { activeUserCount: number };

const EMPTY_PERMISSIONS: Record<PermissionModule, Record<string, boolean>> = {
  patients: {}, consultations: {}, queue: {}, labOrders: {}, examTypes: {},
  prescriptions: {}, rooms: {}, staff: {}, audit: {}, settings: {}, services: {}, specialties: {},
  deviceAuthorization: {}, roles: {},
};

const MODULE_ACTIONS: Record<PermissionModule, string[]> = {
  patients: ["view", "create", "update"],
  consultations: ["view", "create", "update", "cancel"],
  queue: ["view", "appendEvent"],
  labOrders: ["view", "create", "update", "recordFollowUp"],
  examTypes: ["view", "create", "update", "delete"],
  prescriptions: ["view", "create", "update"],
  rooms: ["view", "create", "update", "assign", "release"],
  staff: ["view", "create", "update", "delete"],
  audit: ["view"],
  settings: ["view", "create", "update", "delete"],
  services: ["view", "create", "update"],
  specialties: ["view", "create", "update"],
  deviceAuthorization: ["list", "approve", "revoke"],
  roles: ["view", "create", "update", "delete"],
};

const MODULE_LABEL_KEYS: Record<PermissionModule, string> = {
  patients: "patientsModuleLabel",
  consultations: "consultationsModuleLabel",
  queue: "queueModuleLabel",
  labOrders: "labOrdersModuleLabel",
  examTypes: "examTypesModuleLabel",
  prescriptions: "prescriptionsModuleLabel",
  rooms: "roomsModuleLabel",
  staff: "staffModuleLabel",
  audit: "auditModuleLabel",
  settings: "settingsModuleLabel",
  services: "servicesModuleLabel",
  specialties: "specialtiesModuleLabel",
  deviceAuthorization: "deviceAuthorizationModuleLabel",
  roles: "rolesModuleLabel",
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  view: "actionView",
  create: "actionCreate",
  update: "actionUpdate",
  delete: "actionDelete",
  cancel: "actionCancel",
  appendEvent: "actionAppendEvent",
  recordFollowUp: "actionRecordFollowUp",
  list: "actionList",
  approve: "actionApprove",
  revoke: "actionRevoke",
  assign: "actionAssign",
  release: "actionRelease",
};

export default function RolesPage() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const { data: allRoles = [] } = useQuery<RoleWithUserCount[]>({
    queryKey: ["/api/roles", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/roles/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  const selectedRole = allRoles.find((r) => r.id === selectedRoleId) ?? allRoles[0] ?? null;

  const createRoleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: t("newRoleDefaultName"), permissions: EMPTY_PERMISSIONS }),
      });
      if (!response.ok) throw response;
      return response.json();
    },
    onSuccess: (created: Role) => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", currentTenant?.id] });
      toast({ title: t("success"), description: t("roleCreatedSuccessfully") });
      setSelectedRoleId(created.id);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveRole"), t("networkRequestFailed"));
    },
  });

  return (
    <div className="space-y-6" data-testid="roles-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("rolesPermissionsTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("rolesPermissionsSubtitle")}</p>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex flex-col gap-2 w-[280px] shrink-0">
          {allRoles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedRoleId(role.id)}
              className={cn(
                "flex items-center justify-between rounded-xl border p-4 text-left",
                (selectedRole?.id === role.id) ? "border-primary bg-primary/10" : "border-border bg-card"
              )}
              data-testid={`role-pill-${role.id}`}>
              <span className={cn("font-semibold text-sm", selectedRole?.id === role.id ? "text-primary" : "text-foreground")}>
                {role.name}
              </span>
              <Badge variant={selectedRole?.id === role.id ? "default" : "secondary"}>
                {t("activeUsersCountLabel").replace("{count}", String(role.activeUserCount))}
              </Badge>
            </button>
          ))}
          <Button
            variant="outline"
            className="justify-center gap-2"
            onClick={() => createRoleMutation.mutate()}
            disabled={createRoleMutation.isPending}
            data-testid="button-create-role">
            <Plus className="w-4 h-4" />
            {t("createRoleAction")}
          </Button>
        </div>

        {selectedRole && (
          <Card className="flex-1 p-6 space-y-5" data-testid="role-details-panel">
            <RoleDetailsPanel key={selectedRole.id} role={selectedRole} tenantId={currentTenant?.id ?? ""} />
          </Card>
        )}
      </div>
    </div>
  );
}

function RoleDetailsPanel({ role, tenantId }: { role: RoleWithUserCount; tenantId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [permissions, setPermissions] = useState(role.permissions);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, permissions }),
      });
      if (!response.ok) throw response;
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", tenantId] });
      toast({ title: t("success"), description: t("roleUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveRole"), t("networkRequestFailed"));
    },
  });

  function toggle(module: PermissionModule, action: string) {
    setPermissions((prev) => ({
      ...prev,
      [module]: { ...prev[module], [action]: !prev[module]?.[action] },
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xl font-bold text-foreground bg-transparent border-none p-0 focus:outline-none focus:ring-1 focus:ring-ring rounded"
              data-testid="input-role-name"
            />
            <Badge variant="secondary">{t("activeUsersCountLabel").replace("{count}", String(role.activeUserCount))}</Badge>
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("roleDescriptionLabel")}
            className="text-sm text-muted-foreground bg-transparent border-none p-0 w-full focus:outline-none focus:ring-1 focus:ring-ring rounded"
            data-testid="input-role-description"
          />
        </div>
      </div>

      <div className="space-y-4">
        {(Object.keys(MODULE_ACTIONS) as PermissionModule[]).map((module) => (
          <div key={module} className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t(MODULE_LABEL_KEYS[module])}</p>
            <div className="flex flex-wrap gap-2">
              {MODULE_ACTIONS[module].map((action) => {
                const allowed = permissions[module]?.[action] === true;
                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() => toggle(module, action)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
                      allowed ? "bg-emerald-500/15 text-success" : "bg-red-500/15 text-danger"
                    )}
                    data-testid={`toggle-${module}-${action}`}>
                    {t(ACTION_LABEL_KEYS[action])}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <Button className="w-full btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-role">
          {t("saveRoleChangesAction")}
        </Button>
      </div>
    </div>
  );
}
