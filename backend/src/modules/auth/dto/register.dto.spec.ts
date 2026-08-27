import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegisterDto } from "./register.dto";

describe("RegisterDto", () => {
  const validBase = {
    username: "cashier1",
    password: "secret123",
    firstName: "John",
    lastName: "Doe",
    tenantId: "tenant-1",
  };

  it("accepts valid registration data", async () => {
    const dto = plainToInstance(RegisterDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects username shorter than 3 characters", async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validBase,
      username: "ab",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "username")).toBe(true);
  });

  it("accepts username with exactly 3 characters", async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validBase,
      username: "abc",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects password shorter than 6 characters", async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validBase,
      password: "12345",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "password")).toBe(true);
  });

  it("accepts password with exactly 6 characters", async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validBase,
      password: "123456",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional email", async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validBase,
      email: "john@example.com",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects malformed email", async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validBase,
      email: "not-an-email",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });

  it("accepts valid roles", async () => {
    for (const role of ["admin", "manager", "cashier"] as const) {
      const dto = plainToInstance(RegisterDto, { ...validBase, role });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it("rejects invalid role", async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validBase,
      role: "invalid-role",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "role")).toBe(true);
  });

  it("rejects missing username", async () => {
    const dto = plainToInstance(RegisterDto, {
      password: "secret123",
      firstName: "John",
      lastName: "Doe",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "username")).toBe(true);
  });

  it("rejects missing password", async () => {
    const dto = plainToInstance(RegisterDto, {
      username: "cashier1",
      firstName: "John",
      lastName: "Doe",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "password")).toBe(true);
  });

  it("rejects missing firstName", async () => {
    const dto = plainToInstance(RegisterDto, {
      username: "cashier1",
      password: "secret123",
      lastName: "Doe",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "firstName")).toBe(true);
  });

  it("rejects missing lastName", async () => {
    const dto = plainToInstance(RegisterDto, {
      username: "cashier1",
      password: "secret123",
      firstName: "John",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "lastName")).toBe(true);
  });

  it("rejects missing tenantId", async () => {
    const dto = plainToInstance(RegisterDto, {
      username: "cashier1",
      password: "secret123",
      firstName: "John",
      lastName: "Doe",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "tenantId")).toBe(true);
  });
});