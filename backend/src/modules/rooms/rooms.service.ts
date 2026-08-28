import { Injectable } from "@nestjs/common";
import type { Consultation, InsertRoom, Room } from "@shared/schema";
import { ConsultationsRepository } from "../consultations/consultations.repository";
import { RoomsRepository } from "./rooms.repository";
import { computeRoomStatus, deriveRoomHistory, type RoomStatusResult } from "./room-status";

export type RoomWithStatus = Room & RoomStatusResult;
export type RoomDetail = Room & RoomStatusResult & { recentHistory: Consultation[] };

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly consultationsRepository: ConsultationsRepository
  ) {}

  async findByTenant(tenantId: string): Promise<RoomWithStatus[]> {
    const [rooms, consultations] = await Promise.all([
      this.roomsRepository.findByTenant(tenantId),
      this.consultationsRepository.findByTenant(tenantId, {}),
    ]);
    const now = new Date();
    return rooms.map((room) => {
      const roomConsultations = (consultations as Consultation[]).filter((c) => c.roomId === room.id);
      return { ...room, ...computeRoomStatus(room, roomConsultations, now) };
    });
  }

  async findById(id: string, tenantId: string): Promise<RoomDetail> {
    const room = await this.roomsRepository.findById(id, tenantId);
    const consultations = (await this.consultationsRepository.findByTenant(tenantId, { roomId: id })) as Consultation[];
    const now = new Date();
    return {
      ...room,
      ...computeRoomStatus(room, consultations, now),
      recentHistory: deriveRoomHistory(consultations, 5),
    };
  }

  create(data: InsertRoom) {
    return this.roomsRepository.create(data);
  }

  update(id: string, tenantId: string, data: Partial<InsertRoom>) {
    return this.roomsRepository.update(id, tenantId, data);
  }
}
