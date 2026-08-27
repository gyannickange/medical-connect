import { IsString, IsNotEmpty, IsIn } from "class-validator";

export class AttachPatientPhotoDto {
  @IsString() @IsNotEmpty() photoBase64: string;
  @IsIn(["image/jpeg", "image/png"]) contentType: "image/jpeg" | "image/png";
}
