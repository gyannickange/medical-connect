import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateSettingDto } from "./create-setting.dto";

describe("CreateSettingDto", () => {
  const validSetting = {
    tenantId: "tenant-1",
    key: "receiptFormat",
    value: "retail",
  };

  it("accepts a client UUID for an offline create", async () => {
    const dto = plainToInstance(CreateSettingDto, {
      ...validSetting,
      id: "123e4567-e89b-42d3-a456-426614174000",
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("rejects a malformed offline client ID", async () => {
    const dto = plainToInstance(CreateSettingDto, {
      ...validSetting,
      id: "offline-setting-1",
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "id")).toBe(true);
  });
});
