import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import type { ExamTypeCategory } from "@shared/schema";
import { ExamTypeParameterDto } from "./create-exam-type.dto";

const EXAM_TYPE_CATEGORIES: ExamTypeCategory[] = ["laboratoire", "imagerie", "explorations_fonctionnelles", "autre"];

export class UpdateExamTypeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsIn(EXAM_TYPE_CATEGORIES)
  @IsOptional()
  category?: ExamTypeCategory;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamTypeParameterDto)
  @IsOptional()
  parameters?: ExamTypeParameterDto[];
}
