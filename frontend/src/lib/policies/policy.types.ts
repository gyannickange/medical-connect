import type { PermissionModule } from "@shared/schema";

export type UserRole =
  | "admin"
  | "manager"
  | "cashier"
  | "accueil"
  | "infirmier"
  | "medecin"
  | "laboratoire"
  | "pharmacien"
  | "platform_admin";

export type PolicyAction = string;

export type PermissionsMatrix = Record<PermissionModule, Record<string, boolean>>;
