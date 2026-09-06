import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateSpecialtyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
