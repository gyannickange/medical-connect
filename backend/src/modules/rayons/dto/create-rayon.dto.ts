import { IsString, IsNotEmpty, IsOptional, IsUUID } from "class-validator";
import { Transform } from "class-transformer";

export class CreateRayonDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  tenantId: string;
}
