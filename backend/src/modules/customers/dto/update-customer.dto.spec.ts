import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateCustomerDto } from "./update-customer.dto";

describe("UpdateCustomerDto", () => {
  // Test 7: applies the same email rules as create
  it("accepts omitted email (partial update)", async () => {
    const dto = plainToInstance(UpdateCustomerDto, { firstName: "Jane" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts blank email (empty string) after normalization to undefined", async () => {
    const dto = plainToInstance(UpdateCustomerDto, { email: "" });
    expect(dto.email).toBeUndefined();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts null email after normalization to undefined", async () => {
    const dto = plainToInstance(UpdateCustomerDto, { email: null });
    expect(dto.email).toBeUndefined();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts a valid email", async () => {
    const dto = plainToInstance(UpdateCustomerDto, {
      email: "jane@example.com",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects malformed nonblank email", async () => {
    const dto = plainToInstance(UpdateCustomerDto, { email: "bad-email" });
    const errors = await validate(dto);
    const emailErrors = errors.filter((e) => e.property === "email");
    expect(emailErrors.length).toBeGreaterThan(0);
  });

  it("accepts empty object (all fields optional)", async () => {
    const dto = plainToInstance(UpdateCustomerDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
