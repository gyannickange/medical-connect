import { IsString, IsOptional, IsBoolean } from "class-validator";

export class UpdateSettingDto {
  @IsString()
  @IsOptional()
  value?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  dataType?: string;

  @IsBoolean()
  @IsOptional()
  isEncrypted?: boolean;
}
