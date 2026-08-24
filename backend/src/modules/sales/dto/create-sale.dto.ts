import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsNumber,
  IsInt,
  Min,
  ArrayMinSize,
  IsUUID,
} from "class-validator";
import { Type } from "class-transformer";

export class SaleItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  unitPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  totalPrice: number;

  @IsString()
  @IsOptional()
  @IsIn(["retail", "wholesale", "bulk", "promotional", "none", "auto"])
  priceType?: string;

  @IsString()
  @IsOptional()
  pricingId?: string;
}

export class SaleDataDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  subtotal: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  tax?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  total: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(["cash", "card", "mobile"])
  paymentMethod: "cash" | "card" | "mobile";

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsOptional()
  @IsIn(["pending", "completed", "cancelled", "refunded"])
  status?: "pending" | "completed" | "cancelled" | "refunded";
}

export class CreateSaleDto {
  @ValidateNested()
  @Type(() => SaleDataDto)
  sale: SaleDataDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
