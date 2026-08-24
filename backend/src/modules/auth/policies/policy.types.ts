import { Request } from "express";

export type UserRole = "admin" | "manager" | "cashier";

export interface RequestWithUser extends Request {
  user: {
    id: string;
    username: string;
    tenantId: string;
    role: UserRole;
    [key: string]: any;
  };
}

export type PolicyAction = string;

export type PolicyResult = boolean;

