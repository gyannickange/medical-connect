import { useQuery } from "@tanstack/react-query";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import type { AuditLog } from "@shared/schema";

export interface AuditLogsFilters {
  limit?: number;
  offset?: number;
  page?: number;
  startDate?: string;
  endDate?: string;
  action?: string;
  status?: string;
  entityType?: string;
  userId?: string;
}

export type AuditLogWithPatient = AuditLog & { patientName: string | null };

export function useAuditLogs(
  tenantId: string | undefined,
  filters?: AuditLogsFilters
) {
  return useQuery<AuditLogWithPatient[]>({
    queryKey: ["/api/audit-logs", tenantId, filters],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return [];

      const params = new URLSearchParams();
      if (filters?.limit) params.append("limit", filters.limit.toString());
      if (filters?.offset) params.append("offset", filters.offset.toString());
      if (filters?.page) params.append("page", filters.page.toString());
      if (filters?.startDate) params.append("startDate", filters.startDate);
      if (filters?.endDate) params.append("endDate", filters.endDate);
      if (filters?.action) params.append("action", filters.action);
      if (filters?.status) params.append("status", filters.status);
      if (filters?.entityType) params.append("entityType", filters.entityType);
      if (filters?.userId) params.append("userId", filters.userId);

      const queryString = params.toString();
      const url = `/api/audit-logs/${tenantId}${
        queryString ? `?${queryString}` : ""
      }`;

      const response = await offlineApiRequest("GET", url, undefined, {
        collection: "audit-logs",
      });
      return response.json();
    },
  });
}

export function useAuditLogsByEntity(
  tenantId: string | undefined,
  entityType: string,
  entityId: string,
  options?: { limit?: number; offset?: number }
) {
  return useQuery<AuditLog[]>({
    queryKey: [
      "/api/audit-logs",
      tenantId,
      "entity",
      entityType,
      entityId,
      options,
    ],
    enabled: !!tenantId && !!entityType && !!entityId,
    queryFn: async () => {
      if (!tenantId || !entityType || !entityId) return [];

      const params = new URLSearchParams();
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.offset) params.append("offset", options.offset.toString());

      const queryString = params.toString();
      const url = `/api/audit-logs/${tenantId}/entity/${entityType}/${entityId}${
        queryString ? `?${queryString}` : ""
      }`;

      const response = await offlineApiRequest("GET", url, undefined, {
        collection: "audit-logs",
      });
      return response.json();
    },
  });
}

export function useAuditLogsByUser(
  tenantId: string | undefined,
  userId: string,
  options?: { limit?: number; offset?: number }
) {
  return useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs", tenantId, "user", userId, options],
    enabled: !!tenantId && !!userId,
    queryFn: async () => {
      if (!tenantId || !userId) return [];

      const params = new URLSearchParams();
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.offset) params.append("offset", options.offset.toString());

      const queryString = params.toString();
      const url = `/api/audit-logs/${tenantId}/user/${userId}${
        queryString ? `?${queryString}` : ""
      }`;

      const response = await offlineApiRequest("GET", url, undefined, {
        collection: "audit-logs",
      });
      return response.json();
    },
  });
}
