import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsArray, ArrayMinSize, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class PrescriptionLineDto {
  @IsString() @IsNotEmpty() drugName: string;
  @IsString() @IsNotEmpty() dosage: string;
  @IsString() @IsNotEmpty() frequency: string;
  @IsNumber() @IsOptional() durationDays?: number | null;
  @IsString() @IsOptional() quantity?: string | null;
}

export class CreatePrescriptionDto {
  @IsUUID() @IsNotEmpty() consultationId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PrescriptionLineDto) lines: PrescriptionLineDto[];
}
