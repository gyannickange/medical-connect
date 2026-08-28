import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateStaffDto } from "./create-staff.dto";

describe("CreateStaffDto", () => {
  const validBase = {
    username: "cashier1",
    password: "secret123",
    firstName: "John",
    lastName: "Doe",
    tenantId: "tenant-1",
  };

  it("accepts a client UUID for offline create", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      ...validBase,
      id: "5d29070d-78da-41f8-8138-625a92221161",
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("rejects a malformed offline client ID", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      ...validBase,
      id: "not-a-uuid",
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "id")).toBe(true);
  });

  it("accepts optional email", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      ...validBase,
      email: "john@example.com",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts valid roles", async () => {
    for (const role of ["admin", "manager", "cashier"] as const) {
      const dto = plainToInstance(CreateStaffDto, { ...validBase, role });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it("rejects invalid role", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      ...validBase,
      role: "invalid-role",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "role")).toBe(true);
  });

  it("accepts optional isActive", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      ...validBase,
      isActive: true,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing username", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      password: "secret123",
      firstName: "John",
      lastName: "Doe",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "username")).toBe(true);
  });

  it("rejects missing password", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      username: "cashier1",
      firstName: "John",
      lastName: "Doe",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "password")).toBe(true);
  });

  it("rejects missing firstName", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      username: "cashier1",
      password: "secret123",
      lastName: "Doe",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "firstName")).toBe(true);
  });

  it("rejects missing lastName", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      username: "cashier1",
      password: "secret123",
      firstName: "John",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "lastName")).toBe(true);
  });

  it("rejects missing tenantId", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      username: "cashier1",
      password: "secret123",
      firstName: "John",
      lastName: "Doe",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "tenantId")).toBe(true);
  });

  it("rejects malformed email", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      ...validBase,
      email: "not-an-email",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });

  it("accepts the new optional service/specialty/matricule/fonction fields", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      ...validBase,
      service: "Cardiologie",
      specialty: "Cardiologie interventionnelle",
      matricule: "MED-99382",
      fonction: "Médecin Chef Adjoint",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("stays valid without service/specialty/matricule/fonction (backward compatibility)", async () => {
    const dto = plainToInstance(CreateStaffDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});