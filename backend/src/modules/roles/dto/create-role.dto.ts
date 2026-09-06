import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";
import type { PermissionModule } from "@shared/schema";

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  permissions: Record<PermissionModule, Record<string, boolean>>;

  @IsString()
  @IsOptional()
  tenantId?: string;
}
