import { Module } from "@nestjs/common";
import { PeersController } from "./peers.controller";
import { PeersService } from "./peers.service";
import { SyncModule } from "../sync/sync.module";

@Module({
  imports: [SyncModule],
  controllers: [PeersController],
  providers: [PeersService],
  exports: [PeersService],
})
export class PeersModule {}
