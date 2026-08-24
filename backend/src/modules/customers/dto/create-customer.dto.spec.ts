import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateCustomerDto } from "./create-customer.dto";

describe("CreateCustomerDto", () => {
  const validBase = {
    firstName: "John",
    lastName: "Doe",
    tenantId: "tenant-1",
  };

  it("accepts a client UUID for an offline create", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...validBase,
      id: "5d29070d-78da-41f8-8138-625a92221161",
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("rejects a malformed offline client ID", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...validBase,
      id: "not-a-uuid",
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "id")).toBe(true);
  });

  // Test 5: accepts omitted or blank optional email after normalization
  it("accepts omitted email", async () => {
    const dto = plainToInstance(CreateCustomerDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts blank email (empty string) after normalization to undefined", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...validBase,
      email: "",
    });
    expect(dto.email).toBeUndefined();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts null email after normalization to undefined", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...validBase,
      email: null,
    });
    expect(dto.email).toBeUndefined();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts a valid email", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...validBase,
      email: "john@example.com",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Test 6: rejects malformed nonblank email
  it("rejects malformed nonblank email", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...validBase,
      email: "not-an-email",
    });
    const errors = await validate(dto);
    const emailErrors = errors.filter((e) => e.property === "email");
    expect(emailErrors.length).toBeGreaterThan(0);
  });

  it("rejects email with spaces only", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...validBase,
      email: "   ",
    });
    // After trim/transform, "   " is non-empty and should fail IsEmail
    const errors = await validate(dto);
    const emailErrors = errors.filter((e) => e.property === "email");
    expect(emailErrors.length).toBeGreaterThan(0);
  });

  // Required fields validation
  it("rejects missing firstName", async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      lastName: "Doe",
      tenantId: "tenant-1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "firstName")).toBe(true);
  });
});
