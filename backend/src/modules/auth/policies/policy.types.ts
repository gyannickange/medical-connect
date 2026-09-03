import { Request } from "express";

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

export interface RequestWithUser extends Request {
  user: {
    id: string;
    username: string;
    tenantId: string | null;
    role: UserRole;
    [key: string]: any;
  };
}

export type PolicyAction = string;

export type PolicyResult = boolean;
