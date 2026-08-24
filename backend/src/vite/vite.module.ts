import { Module } from "@nestjs/common";
import { ViteService } from "./vite.service";

@Module({
  providers: [ViteService],
  exports: [ViteService],
})
export class ViteModule {}
