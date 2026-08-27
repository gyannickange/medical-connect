import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn, IsArray, ArrayMinSize, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ExamLineDto {
  @IsString() @IsNotEmpty() examName: string;
}

export class CreateLabOrderDto {
  @IsUUID() @IsNotEmpty() consultationId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ExamLineDto) examLines: ExamLineDto[];
  @IsIn(["normal", "urgent"]) @IsOptional() priority?: string;
  @IsString() @IsOptional() clinicalContext?: string;
  @IsString() @IsOptional() specialInstructions?: string;
}
