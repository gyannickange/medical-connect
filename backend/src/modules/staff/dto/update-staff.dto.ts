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
  @IsIn(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien"])
  role?: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien";

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  service?: string;

  @IsString()
  @IsOptional()
  specialty?: string;

  @IsString()
  @IsOptional()
  matricule?: string;

  @IsString()
  @IsOptional()
  fonction?: string;
}
