import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import type { ExamTypeCategory } from "@shared/schema";

const EXAM_TYPE_CATEGORIES: ExamTypeCategory[] = ["laboratoire", "imagerie", "explorations_fonctionnelles", "autre"];

export class ExamTypeParameterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  unit?: string | null;

  @IsString()
  @IsOptional()
  referenceRange?: string | null;
}

export class CreateExamTypeDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(EXAM_TYPE_CATEGORIES)
  category: ExamTypeCategory;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamTypeParameterDto)
  @IsOptional()
  parameters?: ExamTypeParameterDto[];

  @IsString()
  @IsOptional()
  tenantId?: string;
}
