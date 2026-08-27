import { IsString, IsOptional, IsIn, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ExamLineUpdateDto {
  @IsString() @IsOptional() examName?: string;
  @IsString() @IsOptional() resultText?: string | null;
}

export class UpdateLabOrderDto {
  @IsIn(["demande", "en_cours", "a_valider", "termine", "probleme_signale", "annule"]) @IsOptional() status?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExamLineUpdateDto) @IsOptional() examLines?: ExamLineUpdateDto[];
  @IsString() @IsOptional() problemReport?: string;
}
