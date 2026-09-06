import type { PermissionModule } from "@shared/schema";

export const SEEDABLE_ROLES = [
  "admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien",
] as const;
export type SeedableRole = (typeof SEEDABLE_ROLES)[number];

const ACTIONS_BY_MODULE: Record<PermissionModule, string[]> = {
  patients: ["view", "create", "update"],
  consultations: ["view", "create", "update", "cancel"],
  queue: ["view", "appendEvent"],
  labOrders: ["view", "create", "update", "recordFollowUp"],
  examTypes: ["view", "create", "update", "delete"],
  prescriptions: ["view", "create", "update"],
  rooms: ["view", "create", "update"],
  staff: ["view", "create", "update", "delete"],
  audit: ["view"],
  settings: ["view", "create", "update", "delete"],
  services: ["view", "create", "update"],
  deviceAuthorization: ["list", "approve", "revoke"],
  roles: ["view", "create", "update", "delete"],
};

// One entry per (module, action), listing which of the 8 seedable roles
// currently pass that check in the still-hardcoded policy — read directly
// off patients.policy.ts/consultations.policy.ts/etc. `admin` is omitted
// from every list since it always passes via BasePolicy.can()'s hardcoded
// bypass regardless of this table, but it's still recorded as `true` for
// every action below for the transparency requirement (spec §4).
const ALLOWED_ROLES: { [K in PermissionModule]: Record<string, SeedableRole[]> } = {
  patients: {
    view: ["admin", "manager", "accueil", "infirmier", "medecin"],
    create: ["admin", "manager", "accueil"],
    update: ["admin", "manager", "accueil"],
  },
  consultations: {
    view: ["admin", "manager", "accueil", "infirmier", "medecin"],
    create: ["admin", "manager", "accueil", "medecin"],
    update: ["admin", "manager", "medecin", "infirmier"],
    cancel: ["admin", "manager", "accueil"],
  },
  queue: {
    view: ["admin", "manager", "accueil", "infirmier", "medecin"],
    appendEvent: ["admin", "manager", "accueil", "infirmier", "medecin"],
  },
  labOrders: {
    view: ["admin", "manager", "medecin", "infirmier", "laboratoire"],
    create: ["admin", "manager", "medecin"],
    update: ["admin", "manager", "laboratoire"],
    recordFollowUp: ["admin", "manager", "medecin"],
  },
  examTypes: {
    view: ["admin", "manager", "medecin", "infirmier", "laboratoire"],
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin", "manager"],
  },
  prescriptions: {
    view: ["admin", "manager", "medecin", "infirmier", "pharmacien"],
    create: ["admin", "manager", "medecin"],
    update: ["admin", "manager", "pharmacien"],
  },
  rooms: {
    view: ["admin", "manager", "medecin", "infirmier", "accueil"],
    create: ["admin", "manager"],
    update: ["admin", "manager"],
  },
  staff: {
    view: ["admin", "manager"],
    create: ["admin"],
    update: ["admin"],
    delete: ["admin"],
  },
  audit: {
    view: ["admin"],
  },
  settings: {
    view: ["admin", "manager"],
    create: ["admin"],
    update: ["admin"],
    delete: ["admin"],
  },
  services: {
    view: ["admin", "manager", "accueil", "infirmier", "medecin"],
    create: ["admin", "manager"],
    update: ["admin", "manager"],
  },
  deviceAuthorization: {
    list: ["admin", "manager"],
    approve: ["admin"],
    revoke: ["admin"],
  },
  roles: {
    // New module: nobody but admin manages roles out of the box. A tenant
    // can grant this to another role explicitly after the fact (spec §5).
    view: ["admin"],
    create: ["admin"],
    update: ["admin"],
    delete: ["admin"],
  },
};

export function buildSeedRolePermissions(role: SeedableRole): Record<PermissionModule, Record<string, boolean>> {
  const result = {} as Record<PermissionModule, Record<string, boolean>>;
  for (const module of Object.keys(ACTIONS_BY_MODULE) as PermissionModule[]) {
    const actions = ACTIONS_BY_MODULE[module];
    const allowedByAction = ALLOWED_ROLES[module];
    result[module] = {};
    for (const action of actions) {
      result[module][action] = role === "admin" ? true : (allowedByAction[action]?.includes(role) ?? false);
    }
  }
  return result;
}
