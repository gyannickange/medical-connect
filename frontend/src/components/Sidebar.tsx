import React from "react";
import { Link, useLocation } from "wouter";
import {
  UserCheck,
  ClipboardList,
  Settings,
  Store,
  Check,
  ChevronsUpDown,
  Users,
  CalendarCheck,
  CircleX,
  FlaskConical,
  Pill,
  DoorOpen,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { usePolicy } from "@/hooks/usePolicy";
import { StaffPolicy } from "@/lib/policies/staff.policy";
import { SettingsPolicy } from "@/lib/policies/settings.policy";
import { AuditPolicy } from "@/lib/policies/audit.policy";
import { PatientsPolicy } from "@/lib/policies/patients.policy";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { QueuePolicy } from "@/lib/policies/queue.policy";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PrescriptionsPolicy } from "@/lib/policies/prescriptions.policy";
import { RoomsPolicy } from "@/lib/policies/rooms.policy";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Sidebar: React.FC = () => {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { currentTenant, tenants, setCurrentTenant } = useTenant();
  const staffPolicy = usePolicy(StaffPolicy);
  const settingsPolicy = usePolicy(SettingsPolicy);
  const auditPolicy = usePolicy(AuditPolicy);
  const patientsPolicy = usePolicy(PatientsPolicy);
  const consultationsPolicy = usePolicy(ConsultationsPolicy);
  const queuePolicy = usePolicy(QueuePolicy);
  const labOrdersPolicy = usePolicy(LabOrdersPolicy);
  const prescriptionsPolicy = usePolicy(PrescriptionsPolicy);
  const roomsPolicy = usePolicy(RoomsPolicy);

  const menuItems = [
    ...(patientsPolicy.canView()
      ? [{ icon: Users, label: t("patients"), path: "/patients" }]
      : []),
    ...(consultationsPolicy.canView()
      ? [{ icon: CalendarCheck, label: t("consultations"), path: "/consultations" }]
      : []),
    ...(queuePolicy.canView()
      ? [{ icon: CircleX, label: t("queueTitle"), path: "/file-attente" }]
      : []),
    ...(labOrdersPolicy.canView()
      ? [{ icon: FlaskConical, label: t("laboratoireTitle"), path: "/laboratoire" }]
      : []),
    ...(prescriptionsPolicy.canView()
      ? [{ icon: Pill, label: t("pharmacieTitle"), path: "/pharmacie" }]
      : []),
    ...(roomsPolicy.canView()
      ? [{ icon: DoorOpen, label: t("salles"), path: "/salles" }]
      : []),
    // Only show staff menu if user can view staff
    ...(staffPolicy.canView()
      ? [{ icon: UserCheck, label: t("staff"), path: "/staff" }]
      : []),
    // Only show settings menu if user can view settings
    ...(settingsPolicy.canView()
      ? [{ icon: Settings, label: t("settings"), path: "/settings" }]
      : []),
    // Only show audit logs menu if user can view audit logs (admin only)
    ...(auditPolicy.canView()
      ? [
          {
            icon: ClipboardList,
            label: t("auditLogs") || "Audit Logs",
            path: "/audit-logs",
          },
        ]
      : []),
  ];

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-20 lg:w-64 flex flex-col z-40"
      style={{
        background: "var(--glass-background)",
        backdropFilter: "var(--glass-backdrop)",
        borderRight: "1px solid var(--border)",
      }}
      data-testid="sidebar">
      {/* Logo */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <BrandMark className="w-10 h-10 flex-shrink-0 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
          <div className="hidden lg:block">
            <h1 className="text-lg font-display font-bold text-foreground">
              Medical Connect
            </h1>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav
        className="flex-1 p-3 lg:p-4 overflow-y-auto"
        data-testid="navigation-menu">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`nav-item min-h-10 flex items-center space-x-2.5 text-sm transition-all duration-300 ${
                  active ? "active" : ""
                }`}
                data-testid={`nav-${item.path.slice(1) || "dashboard"}`}>
                <Icon className="w-4 h-4" />
                <span className="hidden lg:block font-medium">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Account switcher */}
      <div className="p-3 lg:p-4 border-t border-border flex-shrink-0">
        {currentTenant && (
          tenants.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="glass-card flex min-h-12 w-full items-center gap-2 rounded-lg p-2 text-left outline-none transition-colors duration-200 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring lg:p-3"
                  aria-label={t("switchAccount")}
                  data-testid="account-switcher">
                  <Store className="h-5 w-5 shrink-0 text-accent-primary" />
                  <span className="hidden min-w-0 flex-1 lg:block">
                    <span className="block text-xs font-medium text-muted-foreground">
                      {t("currentTenant")}
                    </span>
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {currentTenant.name}
                    </span>
                  </span>
                  <ChevronsUpDown className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={8}
                className="w-60"
                data-testid="account-switcher-menu">
                <DropdownMenuLabel>{t("availableAccounts")}</DropdownMenuLabel>
                {tenants.map((tenant) => (
                  <DropdownMenuItem
                    key={tenant.id}
                    onSelect={() => setCurrentTenant(tenant)}
                    className="min-h-11 cursor-pointer"
                    data-testid={`account-option-${tenant.id}`}>
                    <Store className="h-4 w-4 text-accent-primary" />
                    <span className="min-w-0 flex-1 truncate">{tenant.name}</span>
                    {tenant.id === currentTenant.id && (
                      <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div
              className="glass-card flex min-h-12 items-center gap-2 rounded-lg p-2 lg:p-3"
              data-testid="current-account">
              <Store className="h-5 w-5 shrink-0 text-accent-primary" />
              <div className="hidden min-w-0 lg:block">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("currentTenant")}
                </p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {currentTenant.name}
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </aside>
  );
};
