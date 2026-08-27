import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class PrescriptionLineUpdateDto {
  @IsString() @IsNotEmpty() drugName: string;
  @IsString() @IsNotEmpty() dosage: string;
  @IsString() @IsNotEmpty() frequency: string;
  @IsNumber() @IsOptional() durationDays?: number | null;
  @IsString() @IsOptional() quantity?: string | null;
  @IsIn(["en_attente", "delivre", "indisponible"]) dispenseStatus: string;
}

export class UpdatePrescriptionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PrescriptionLineUpdateDto) @IsOptional() lines?: PrescriptionLineUpdateDto[];
  @IsIn(["en_attente", "prepare", "delivre", "delivre_partiel", "annule"]) @IsOptional() status?: string;
}
