import { AuditInterceptor } from "./audit.interceptor";

describe("AuditInterceptor", () => {
  function extract(path: string) {
    const interceptor = new AuditInterceptor({ logAction: jest.fn() } as any);
    return (interceptor as any).extractEntityInfo(path, {}, {});
  }

  it.each([
    ["/api/patients/123", "patients"],
    ["/api/consultations/123", "consultations"],
    ["/api/queue/tenant-1", "queue"],
    ["/api/staff/123", "staff"],
    ["/api/settings/123", "settings"],
    ["/api/tenants/123", "tenants"],
    ["/api/lab-orders/123", "lab-orders"],
    ["/api/prescriptions/123", "prescriptions"],
    ["/api/rooms/123", "rooms"],
  ])("resolves %s to entityType %s", (path, expected) => {
    expect(extract(path).entityType).toBe(expected);
  });

  it("falls back to unknown for an unrecognized path", () => {
    expect(extract("/api/something-else/123").entityType).toBe("unknown");
  });
});
