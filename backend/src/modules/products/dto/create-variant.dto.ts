import {
  IsString,
  IsNotEmpty,
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
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class CreateVariantDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1, { message: "At least one attribute is required" })
  @Type(() => VariantAttributeDto)
  attributes: VariantAttributeDto[];

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
    if (value === "" || value === null || value === undefined) return 0;
    const num = typeof value === "string" ? parseInt(value) : value;
    return isNaN(num) ? 0 : num;
  })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @Transform(({ value }) => {
    if (value === "" || value === null || value === undefined) return 10;
    const num = typeof value === "string" ? parseInt(value) : value;
    return isNaN(num) ? 10 : num;
  })
  @IsNumber()
  @IsOptional()
  minStockAlert?: number;

  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
