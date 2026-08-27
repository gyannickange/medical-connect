import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RequestPasswordResetDto, ResetPasswordDto } from "./password-reset.dto";

describe("Password Reset DTOs", () => {
  describe("RequestPasswordResetDto", () => {
    it("accepts valid username", async () => {
      const dto = plainToInstance(RequestPasswordResetDto, {
        username: "cashier1",
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("rejects missing username", async () => {
      const dto = plainToInstance(RequestPasswordResetDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === "username")).toBe(true);
    });

    it("rejects empty username", async () => {
      const dto = plainToInstance(RequestPasswordResetDto, {
        username: "",
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === "username")).toBe(true);
    });
  });

  describe("ResetPasswordDto", () => {
    it("accepts valid reset data", async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        username: "cashier1",
        newPassword: "newsecret123",
        oldPassword: "oldsecret123",
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("rejects newPassword shorter than 6 characters", async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        username: "cashier1",
        newPassword: "12345",
        oldPassword: "oldsecret123",
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === "newPassword")).toBe(true);
    });

    it("accepts newPassword with exactly 6 characters", async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        username: "cashier1",
        newPassword: "123456",
        oldPassword: "oldsecret123",
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("rejects missing username", async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        newPassword: "newsecret123",
        oldPassword: "oldsecret123",
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === "username")).toBe(true);
    });

    it("rejects missing newPassword", async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        username: "cashier1",
        oldPassword: "oldsecret123",
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === "newPassword")).toBe(true);
    });

    it("rejects missing oldPassword", async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        username: "cashier1",
        newPassword: "newsecret123",
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === "oldPassword")).toBe(true);
    });

    it("rejects empty newPassword", async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        username: "cashier1",
        newPassword: "",
        oldPassword: "oldsecret123",
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === "newPassword")).toBe(true);
    });
  });
});