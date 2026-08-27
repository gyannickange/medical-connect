import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateTenantDto } from "./create-tenant.dto";

describe("CreateTenantDto", () => {
  const validBase = {
    name: "My Store",
  };

  it("accepts valid tenant data", async () => {
    const dto = plainToInstance(CreateTenantDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional address", async () => {
    const dto = plainToInstance(CreateTenantDto, {
      ...validBase,
      address: "123 Main St",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional phone", async () => {
    const dto = plainToInstance(CreateTenantDto, {
      ...validBase,
      phone: "+1-555-123-4567",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional email", async () => {
    const dto = plainToInstance(CreateTenantDto, {
      ...validBase,
      email: "store@example.com",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional settings object", async () => {
    const dto = plainToInstance(CreateTenantDto, {
      ...validBase,
      settings: { theme: "dark", currency: "USD" },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional isActive", async () => {
    const dto = plainToInstance(CreateTenantDto, {
      ...validBase,
      isActive: true,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing name", async () => {
    const dto = plainToInstance(CreateTenantDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "name")).toBe(true);
  });

  it("rejects empty name", async () => {
    const dto = plainToInstance(CreateTenantDto, {
      name: "",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "name")).toBe(true);
  });
});