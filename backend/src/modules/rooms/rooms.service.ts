import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { CarePlanHospitalisation, Consultation, InsertRoom, Room } from "@shared/schema";
import { ConsultationsRepository } from "../consultations/consultations.repository";
import { PatientsRepository } from "../patients/patients.repository";
import { RoomsRepository } from "./rooms.repository";
import { computeRoomStatus, deriveRoomHistory, type RoomStatusResult } from "./room-status";

export type RoomWithStatus = Room & RoomStatusResult & { assignedPatientName: string | null };
export type RoomDetail = Room & RoomStatusResult & { assignedPatientName: string | null; recentHistory: Consultation[] };

export interface PendingHospitalisation {
  consultationId: string;
  patientId: string;
  patientName: string;
  targetService: string;
  bedUrgentlyRequired: boolean;
  closedAt: Date | null;
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly consultationsRepository: ConsultationsRepository,
    private readonly patientsRepository: PatientsRepository
  ) {}

  async findByTenant(tenantId: string): Promise<RoomWithStatus[]> {
    const [rooms, consultations] = await Promise.all([
      this.roomsRepository.findByTenant(tenantId),
      this.consultationsRepository.findByTenant(tenantId, {}),
    ]);
    const now = new Date();
    return Promise.all(
      rooms.map(async (room) => {
        const roomConsultations = (consultations as Consultation[]).filter((c) => c.roomId === room.id);
        return {
          ...room,
          ...computeRoomStatus(room, roomConsultations, now),
          assignedPatientName: await this.resolveAssignedPatientName(room, tenantId),
        };
      })
    );
  }

  async findById(id: string, tenantId: string): Promise<RoomDetail> {
    const room = await this.roomsRepository.findById(id, tenantId);
    const consultations = (await this.consultationsRepository.findByTenant(tenantId, { roomId: id })) as Consultation[];
    const now = new Date();
    return {
      ...room,
      ...computeRoomStatus(room, consultations, now),
      assignedPatientName: await this.resolveAssignedPatientName(room, tenantId),
      recentHistory: deriveRoomHistory(consultations, 5),
    };
  }

  create(data: InsertRoom) {
    return this.roomsRepository.create(data);
  }

  async update(id: string, tenantId: string, data: Partial<InsertRoom>): Promise<Room> {
    if (data.status === "en_maintenance") {
      const current = await this.roomsRepository.findById(id, tenantId);
      if (current.assignedPatientId) {
        throw new BadRequestException("Cannot mark a room assigned to a patient as under maintenance");
      }
    }
    return this.roomsRepository.update(id, tenantId, data);
  }

  async assign(id: string, tenantId: string, data: { patientId: string; consultationId: string }): Promise<Room> {
    const current = await this.findById(id, tenantId);
    if (current.effectiveStatus !== "disponible") {
      throw new ConflictException("Room is not available");
    }
    return this.roomsRepository.update(id, tenantId, {
      assignedPatientId: data.patientId,
      assignedConsultationId: data.consultationId,
    });
  }

  release(id: string, tenantId: string): Promise<Room> {
    return this.roomsRepository.update(id, tenantId, { assignedPatientId: null, assignedConsultationId: null });
  }

  async findPendingHospitalisations(tenantId: string): Promise<PendingHospitalisation[]> {
    const [consultations, rooms] = await Promise.all([
      this.consultationsRepository.findByTenant(tenantId, {}),
      this.roomsRepository.findByTenant(tenantId),
    ]);
    const assignedConsultationIds = new Set(
      rooms.filter((r) => r.assignedConsultationId).map((r) => r.assignedConsultationId as string)
    );

    const pending = (consultations as Consultation[]).filter(
      (c): c is Consultation & { carePlan: CarePlanHospitalisation } =>
        c.status === "terminee" && c.carePlan?.orientation === "hospitalisation" && !assignedConsultationIds.has(c.id)
    );
    pending.sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0));

    return Promise.all(
      pending.map(async (c) => {
        const patient = await this.patientsRepository.findById(c.patientId, tenantId);
        return {
          consultationId: c.id,
          patientId: c.patientId,
          patientName: `${patient.firstName} ${patient.lastName}`,
          targetService: c.carePlan.targetService,
          bedUrgentlyRequired: c.carePlan.bedUrgentlyRequired,
          closedAt: c.closedAt,
        };
      })
    );
  }

  private async resolveAssignedPatientName(room: Room, tenantId: string): Promise<string | null> {
    if (!room.assignedPatientId) return null;
    const patient = await this.patientsRepository.findById(room.assignedPatientId, tenantId);
    return `${patient.firstName} ${patient.lastName}`;
  }
}
