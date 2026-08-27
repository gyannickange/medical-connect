import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RequestDeviceAuthorizationDto } from "./request-device-authorization.dto";

describe("RequestDeviceAuthorizationDto", () => {
  it("accepts valid device authorization request", async () => {
    const dto = plainToInstance(RequestDeviceAuthorizationDto, {
      deviceId: "device-123",
      devicePublicKey: "public-key-data",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional provisioningSecret", async () => {
    const dto = plainToInstance(RequestDeviceAuthorizationDto, {
      deviceId: "device-123",
      devicePublicKey: "public-key-data",
      provisioningSecret: "secret-value",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing deviceId", async () => {
    const dto = plainToInstance(RequestDeviceAuthorizationDto, {
      devicePublicKey: "public-key-data",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "deviceId")).toBe(true);
  });

  it("rejects missing devicePublicKey", async () => {
    const dto = plainToInstance(RequestDeviceAuthorizationDto, {
      deviceId: "device-123",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "devicePublicKey")).toBe(true);
  });

  it("rejects empty deviceId", async () => {
    const dto = plainToInstance(RequestDeviceAuthorizationDto, {
      deviceId: "",
      devicePublicKey: "public-key-data",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "deviceId")).toBe(true);
  });

  it("rejects empty devicePublicKey", async () => {
    const dto = plainToInstance(RequestDeviceAuthorizationDto, {
      deviceId: "device-123",
      devicePublicKey: "",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "devicePublicKey")).toBe(true);
  });
});