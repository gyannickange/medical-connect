import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateRoomDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  number: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  equipment?: string[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsIn(["disponible", "en_maintenance"])
  @IsOptional()
  status?: "disponible" | "en_maintenance";

  @IsString()
  @IsOptional()
  tenantId?: string;
}
