import { IsString, IsNotEmpty, IsOptional } from "class-validator";
import { Transform } from "class-transformer";

export class UpdateRayonDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
