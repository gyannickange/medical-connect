import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateSettingDto } from "./update-setting.dto";

describe("UpdateSettingDto", () => {
  it("accepts partial update with only value", async () => {
    const dto = plainToInstance(UpdateSettingDto, { value: "wholesale" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional category", async () => {
    const dto = plainToInstance(UpdateSettingDto, { category: "receipt" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional dataType", async () => {
    const dto = plainToInstance(UpdateSettingDto, { dataType: "string" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional isEncrypted", async () => {
    const dto = plainToInstance(UpdateSettingDto, { isEncrypted: true });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts empty object (all fields optional)", async () => {
    const dto = plainToInstance(UpdateSettingDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});