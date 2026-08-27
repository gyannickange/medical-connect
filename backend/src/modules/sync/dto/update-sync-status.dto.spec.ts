import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateSyncStatusDto } from "./update-sync-status.dto";

describe("UpdateSyncStatusDto", () => {
  const validBase = {
    tenantId: "tenant-1",
    deviceId: "device-123",
    status: "online" as const,
  };

  it("accepts valid sync status update", async () => {
    const dto = plainToInstance(UpdateSyncStatusDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts all valid statuses", async () => {
    for (const status of ["online", "offline", "syncing", "error"] as const) {
      const dto = plainToInstance(UpdateSyncStatusDto, {
        ...validBase,
        status,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it("rejects invalid status", async () => {
    const dto = plainToInstance(UpdateSyncStatusDto, {
      ...validBase,
      status: "invalid",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "status")).toBe(true);
  });

  it("accepts optional pendingChanges", async () => {
    const dto = plainToInstance(UpdateSyncStatusDto, {
      ...validBase,
      pendingChanges: 5,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing tenantId", async () => {
    const { tenantId, ...rest } = validBase;
    const dto = plainToInstance(UpdateSyncStatusDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "tenantId")).toBe(true);
  });

  it("rejects missing deviceId", async () => {
    const { deviceId, ...rest } = validBase;
    const dto = plainToInstance(UpdateSyncStatusDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "deviceId")).toBe(true);
  });

  it("rejects missing status", async () => {
    const { status, ...rest } = validBase;
    const dto = plainToInstance(UpdateSyncStatusDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "status")).toBe(true);
  });
});