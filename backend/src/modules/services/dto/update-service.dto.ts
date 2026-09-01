import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateServiceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
