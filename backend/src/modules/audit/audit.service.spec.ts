import { AuditService } from "./audit.service";

describe("AuditService.getAuditLogs", () => {
  it("enriches every log with a resolved patientName", async () => {
    const logs = [
      { id: "log-1", entityType: "consultations", entityId: "c-1", changes: null },
      { id: "log-2", entityType: "staff", entityId: "user-1", changes: null },
    ];
    const auditRepository = {
      find: jest.fn().mockResolvedValue(logs),
      resolvePatientName: jest.fn().mockResolvedValueOnce("Aissatou Diallo").mockResolvedValueOnce(null),
    };
    const service = new AuditService(auditRepository as any);

    const result = await service.getAuditLogs("tenant-1");

    expect(result[0]).toMatchObject({ id: "log-1", patientName: "Aissatou Diallo" });
    expect(result[1]).toMatchObject({ id: "log-2", patientName: null });
    expect(auditRepository.resolvePatientName).toHaveBeenCalledWith("tenant-1", "consultations", "c-1", null);
  });
});
