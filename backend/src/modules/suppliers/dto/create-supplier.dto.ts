import { IsString, IsNotEmpty, IsOptional, IsUUID } from "class-validator";

export class CreateSupplierDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsOptional()
  isActive?: boolean;
}
