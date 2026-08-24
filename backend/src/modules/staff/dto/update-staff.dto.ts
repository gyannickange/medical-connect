import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsIn,
} from "class-validator";

export class UpdateStaffDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @IsIn(["admin", "manager", "cashier"])
  role?: "admin" | "manager" | "cashier";

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
