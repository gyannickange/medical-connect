import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreatePlatformTenantDto } from "./create-platform-tenant.dto";

describe("CreatePlatformTenantDto", () => {
  const validBase = {
    name: "Clinique du Nord",
    adminUsername: "nord-admin",
    adminPassword: "secret123",
    adminFirstName: "Awa",
    adminLastName: "Diop",
  };

  it("accepts a valid tenant + admin payload", async () => {
    const dto = plainToInstance(CreatePlatformTenantDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional tenant fields and adminEmail", async () => {
    const dto = plainToInstance(CreatePlatformTenantDto, {
      ...validBase,
      address: "123 Rue Principale",
      phone: "+225-01-23-45-67",
      email: "clinique@example.com",
      settings: { currency: "XOF" },
      isActive: true,
      adminEmail: "awa@example.com",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a missing tenant name", async () => {
    const { name, ...rest } = validBase;
    const dto = plainToInstance(CreatePlatformTenantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "name")).toBe(true);
  });

  it("rejects an admin username shorter than 3 characters", async () => {
    const dto = plainToInstance(CreatePlatformTenantDto, { ...validBase, adminUsername: "ab" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "adminUsername")).toBe(true);
  });

  it("rejects an admin password shorter than 6 characters", async () => {
    const dto = plainToInstance(CreatePlatformTenantDto, { ...validBase, adminPassword: "abc" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "adminPassword")).toBe(true);
  });

  it("rejects a missing adminFirstName/adminLastName", async () => {
    const { adminFirstName, adminLastName, ...rest } = validBase;
    const dto = plainToInstance(CreatePlatformTenantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "adminFirstName")).toBe(true);
    expect(errors.some((e) => e.property === "adminLastName")).toBe(true);
  });
});
