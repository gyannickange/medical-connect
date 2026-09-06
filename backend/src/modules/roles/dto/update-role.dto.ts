import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";
import type { PermissionModule } from "@shared/schema";

export class UpdateRoleDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  permissions?: Record<PermissionModule, Record<string, boolean>>;
}
