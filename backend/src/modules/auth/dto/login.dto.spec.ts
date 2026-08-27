import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { LoginDto } from "./login.dto";

describe("LoginDto", () => {
  it("accepts valid username and password", async () => {
    const dto = plainToInstance(LoginDto, {
      username: "cashier1",
      password: "secret123",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing username", async () => {
    const dto = plainToInstance(LoginDto, {
      password: "secret123",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "username")).toBe(true);
  });

  it("rejects missing password", async () => {
    const dto = plainToInstance(LoginDto, {
      username: "cashier1",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "password")).toBe(true);
  });

  it("rejects empty username", async () => {
    const dto = plainToInstance(LoginDto, {
      username: "",
      password: "secret123",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "username")).toBe(true);
  });

  it("rejects empty password", async () => {
    const dto = plainToInstance(LoginDto, {
      username: "cashier1",
      password: "",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "password")).toBe(true);
  });
});