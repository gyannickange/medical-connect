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

  it("accepts any role id string (validity against the tenant's Role registry is checked at the service layer, not here)", async () => {
    for (const role of ["admin", "manager", "cashier", "custom-role-id"]) {
      const dto = plainToInstance(UpdateStaffDto, { role });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
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

  it("accepts the new optional service/specialty/matricule/fonction fields", async () => {
    const dto = plainToInstance(UpdateStaffDto, {
      service: "Cardiologie",
      specialty: "Cardiologie interventionnelle",
      matricule: "MED-99382",
      fonction: "Médecin Chef Adjoint",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});