import { IsString, IsOptional, IsIn, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ExamResultParameterUpdateDto {
  @IsString() name: string;
  @IsString() @IsOptional() unit?: string | null;
  @IsString() @IsOptional() referenceRange?: string | null;
  @IsString() @IsOptional() value?: string | null;
  @IsIn(["normal", "bas", "eleve", "anormal"]) @IsOptional() status?: string | null;
}

class ExamLineUpdateDto {
  @IsString() @IsOptional() examName?: string;
  @IsString() @IsOptional() resultText?: string | null;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExamResultParameterUpdateDto) @IsOptional() parameters?: ExamResultParameterUpdateDto[];
}

export class UpdateLabOrderDto {
  @IsIn(["demande", "en_cours", "a_valider", "termine", "probleme_signale", "annule"]) @IsOptional() status?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExamLineUpdateDto) @IsOptional() examLines?: ExamLineUpdateDto[];
  @IsString() @IsOptional() problemReport?: string;
  @IsString() @IsOptional() labComment?: string | null;
}
