import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from "class-validator";
import { Type, Transform } from "class-transformer";

export class VariantAttributeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  value?: string;
}

export class UpdateVariantDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1, { message: "At least one attribute is required" })
  @Type(() => VariantAttributeDto)
  @IsOptional()
  attributes?: VariantAttributeDto[];

  @IsString()
  @IsOptional()
  sku?: string;

  @Transform(({ value }) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  price?: number;

  /** Editable by admin/manager even when CMP is active; next variant purchase will recalculate CMP. */
  @Transform(({ value }) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  cost?: number;

  @IsString()
  @IsOptional()
  barcode?: string;

  @Transform(({ value }) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const num = typeof value === "string" ? parseInt(value) : value;
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @Transform(({ value }) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const num = typeof value === "string" ? parseInt(value) : value;
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  @IsOptional()
  minStockAlert?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
