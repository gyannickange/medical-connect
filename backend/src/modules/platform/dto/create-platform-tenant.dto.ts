import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  IsEmail,
  MinLength,
} from "class-validator";

export class CreatePlatformTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  adminUsername: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  adminPassword: string;

  @IsString()
  @IsNotEmpty()
  adminFirstName: string;

  @IsString()
  @IsNotEmpty()
  adminLastName: string;

  @IsEmail()
  @IsOptional()
  adminEmail?: string;
}
