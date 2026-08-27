import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateStaffDto } from "./update-staff.dto";

describe("UpdateStaffDto", () => {
  it("accepts partial update with only username", async () => {
    const dto = plainToInstance(UpdateStaffDto, { username: "updated" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts partial update with only password", async () => {
    const dto = plainToInstance(UpdateStaffDto, { password: "newsecret" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts partial update with only firstName", async () => {
    const dto = plainToInstance(UpdateStaffDto, { firstName: "Jane" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts partial update with only lastName", async () => {
    const dto = plainToInstance(UpdateStaffDto, { lastName: "Smith" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional email", async () => {
    const dto = plainToInstance(UpdateStaffDto, { email: "jane@example.com" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects malformed email", async () => {
    const dto = plainToInstance(UpdateStaffDto, { email: "not-an-email" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });

  it("accepts valid roles", async () => {
    for (const role of ["admin", "manager", "cashier"] as const) {
      const dto = plainToInstance(UpdateStaffDto, { role });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it("rejects invalid role", async () => {
    const dto = plainToInstance(UpdateStaffDto, { role: "invalid-role" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "role")).toBe(true);
  });

  it("accepts optional isActive", async () => {
    const dto = plainToInstance(UpdateStaffDto, { isActive: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts empty object (all fields optional)", async () => {
    const dto = plainToInstance(UpdateStaffDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});