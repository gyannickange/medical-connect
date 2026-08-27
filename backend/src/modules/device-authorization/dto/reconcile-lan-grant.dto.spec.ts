import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ReconcileLanGrantDto } from "./reconcile-lan-grant.dto";

describe("ReconcileLanGrantDto", () => {
  const validBase = {
    grantedDeviceId: "device-123",
    grantedByDeviceId: "device-456",
    grantedByCertificate: "cert-data",
    approvalCapability: "full",
    tenantFingerprint: "tenant-fingerprint",
    decidedAt: "2024-01-15T10:30:00.000Z",
    signature: "signature-data",
  };

  it("accepts valid LAN grant reconciliation data", async () => {
    const dto = plainToInstance(ReconcileLanGrantDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing grantedDeviceId", async () => {
    const { grantedDeviceId, ...rest } = validBase;
    const dto = plainToInstance(ReconcileLanGrantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "grantedDeviceId")).toBe(true);
  });

  it("rejects missing grantedByDeviceId", async () => {
    const { grantedByDeviceId, ...rest } = validBase;
    const dto = plainToInstance(ReconcileLanGrantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "grantedByDeviceId")).toBe(true);
  });

  it("rejects missing grantedByCertificate", async () => {
    const { grantedByCertificate, ...rest } = validBase;
    const dto = plainToInstance(ReconcileLanGrantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "grantedByCertificate")).toBe(true);
  });

  it("rejects missing approvalCapability", async () => {
    const { approvalCapability, ...rest } = validBase;
    const dto = plainToInstance(ReconcileLanGrantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "approvalCapability")).toBe(true);
  });

  it("rejects missing tenantFingerprint", async () => {
    const { tenantFingerprint, ...rest } = validBase;
    const dto = plainToInstance(ReconcileLanGrantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "tenantFingerprint")).toBe(true);
  });

  it("rejects missing decidedAt", async () => {
    const { decidedAt, ...rest } = validBase;
    const dto = plainToInstance(ReconcileLanGrantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "decidedAt")).toBe(true);
  });

  it("rejects invalid decidedAt format (not ISO8601)", async () => {
    const dto = plainToInstance(ReconcileLanGrantDto, {
      ...validBase,
      decidedAt: "not-a-date",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "decidedAt")).toBe(true);
  });

  it("rejects missing signature", async () => {
    const { signature, ...rest } = validBase;
    const dto = plainToInstance(ReconcileLanGrantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "signature")).toBe(true);
  });

  it("accepts valid ISO8601 dates", async () => {
    const validDates = [
      "2024-01-15T10:30:00.000Z",
      "2024-01-15T10:30:00Z",
      "2024-01-15",
    ];
    for (const date of validDates) {
      const dto = plainToInstance(ReconcileLanGrantDto, {
        ...validBase,
        decidedAt: date,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });
});