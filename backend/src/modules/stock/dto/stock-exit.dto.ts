import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
} from "class-validator";
import { Type, Transform } from "class-transformer";

export class StockExitDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === "" || value == null ? undefined : value))
  reason?: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  tenantId: string;
}
