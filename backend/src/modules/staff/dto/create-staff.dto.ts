import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsIn,
  IsUUID,
} from "class-validator";

export class CreateStaffDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @IsIn(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien"])
  role?: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien";

  @IsString()
  @IsNotEmpty()
  tenantId: string;

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
