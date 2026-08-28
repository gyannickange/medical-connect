import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class UpdateRoomDto {
  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  capacity?: number;

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
}
