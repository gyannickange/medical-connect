import { IsString, IsNotEmpty } from "class-validator";

export class AddLabOrderAttachmentDto {
  @IsString() @IsNotEmpty() fileName: string;
  @IsString() @IsNotEmpty() contentType: string;
  @IsString() @IsNotEmpty() fileBase64: string;
}
