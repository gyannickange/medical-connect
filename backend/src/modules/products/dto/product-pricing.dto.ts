import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export enum ProductPriceType {
  RETAIL = "retail",
  WHOLESALE = "wholesale",
  BULK = "bulk",
  PROMOTIONAL = "promotional",
}

const optionalNumber = ({ value }: { value: unknown }) =>
  value === "" || value === null || value === undefined ? undefined : Number(value);

const optionalNullableNumber = ({ value }: { value: unknown }) =>
  value === "" || value === null
    ? null
    : value === undefined
      ? undefined
      : Number(value);

const optionalDate = ({ value }: { value: unknown }) =>
  value === "" || value === null
    ? null
    : value === undefined
      ? undefined
      : new Date(value as string | number | Date);

export class CreateProductPricingDto {
  @IsEnum(ProductPriceType)
  priceType: ProductPriceType;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  price: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantity: number;

  @Transform(optionalNullableNumber)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxQuantity?: number | null;

  @Transform(optionalDate)
  @IsDate()
  @IsOptional()
  validFrom?: Date | null;

  @Transform(optionalDate)
  @IsDate()
  @IsOptional()
  validTo?: Date | null;

  @IsString()
  @IsOptional()
  variantId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateProductPricingDto {
  @IsEnum(ProductPriceType)
  @IsOptional()
  priceType?: ProductPriceType;

  @Transform(optionalNumber)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  price?: number;

  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @IsOptional()
  minQuantity?: number;

  @Transform(optionalNullableNumber)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxQuantity?: number | null;

  @Transform(optionalDate)
  @IsDate()
  @IsOptional()
  validFrom?: Date | null;

  @Transform(optionalDate)
  @IsDate()
  @IsOptional()
  validTo?: Date | null;

  @IsString()
  @IsOptional()
  variantId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CalculateProductPriceQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsEnum(ProductPriceType)
  @IsOptional()
  priceType?: ProductPriceType;
}
