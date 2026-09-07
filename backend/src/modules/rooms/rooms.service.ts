import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { CarePlanHospitalisation, Consultation, InsertRoom, Room } from "@shared/schema";
import { ConsultationsRepository } from "../consultations/consultations.repository";
import { PatientsRepository } from "../patients/patients.repository";
import { UsersRepository } from "../identity/users.repository";
import { RoomsRepository } from "./rooms.repository";
import { computeRoomStatus, deriveRoomHistory, type RoomStatusResult } from "./room-status";

interface ResolvedNames {
  assignedPatientNames: string[];
  currentConsultationPatientName: string | null;
  currentConsultationDoctorName: string | null;
  nextReservationPatientName: string | null;
}

export type RoomHistoryEntry = Consultation & { patientName: string | null };

export type RoomWithStatus = Room & RoomStatusResult & ResolvedNames;
export type RoomDetail = Room & RoomStatusResult & ResolvedNames & { recentHistory: RoomHistoryEntry[] };

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
    private readonly patientsRepository: PatientsRepository,
    private readonly usersRepository: UsersRepository
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
        const status = computeRoomStatus(room, roomConsultations, now);
        return { ...room, ...status, ...(await this.resolveNames(room, status, tenantId)) };
      })
    );
  }

  async findById(id: string, tenantId: string): Promise<RoomDetail> {
    const room = await this.roomsRepository.findById(id, tenantId);
    const consultations = (await this.consultationsRepository.findByTenant(tenantId, { roomId: id })) as Consultation[];
    const now = new Date();
    const status = computeRoomStatus(room, consultations, now);
    const recentHistory = await Promise.all(
      deriveRoomHistory(consultations, 5).map(async (c) => ({
        ...c,
        patientName: await this.resolvePatientName(c.patientId, tenantId),
      }))
    );
    return {
      ...room,
      ...status,
      ...(await this.resolveNames(room, status, tenantId)),
      recentHistory,
    };
  }

  create(data: InsertRoom) {
    return this.roomsRepository.create(data);
  }

  async update(id: string, tenantId: string, data: Partial<InsertRoom>): Promise<Room> {
    if (data.status === "en_maintenance") {
      const current = await this.roomsRepository.findById(id, tenantId);
      if (current.assignments.length > 0) {
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
      assignments: [...current.assignments, { patientId: data.patientId, consultationId: data.consultationId }],
    });
  }

  async release(id: string, tenantId: string, consultationId: string): Promise<Room> {
    const current = await this.roomsRepository.findById(id, tenantId);
    return this.roomsRepository.update(id, tenantId, {
      assignments: current.assignments.filter((a) => a.consultationId !== consultationId),
    });
  }

  async findPendingHospitalisations(tenantId: string): Promise<PendingHospitalisation[]> {
    const [consultations, rooms] = await Promise.all([
      this.consultationsRepository.findByTenant(tenantId, {}),
      this.roomsRepository.findByTenant(tenantId),
    ]);
    const assignedConsultationIds = new Set(rooms.flatMap((r) => r.assignments.map((a) => a.consultationId)));

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

  private async resolveNames(room: Room, status: RoomStatusResult, tenantId: string): Promise<ResolvedNames> {
    const [assignedPatientNames, currentConsultationPatientName, currentConsultationDoctorName, nextReservationPatientName] =
      await Promise.all([
        Promise.all(room.assignments.map((a) => this.resolvePatientName(a.patientId, tenantId))),
        this.resolvePatientName(status.currentConsultation?.patientId ?? null, tenantId),
        this.resolveDoctorName(status.currentConsultation?.assignedDoctorId ?? null),
        this.resolvePatientName(status.upcomingConsultations[0]?.patientId ?? null, tenantId),
      ]);
    return {
      assignedPatientNames: assignedPatientNames.filter((name): name is string => name !== null),
      currentConsultationPatientName,
      currentConsultationDoctorName,
      nextReservationPatientName,
    };
  }

  private async resolvePatientName(patientId: string | null, tenantId: string): Promise<string | null> {
    if (!patientId) return null;
    const patient = await this.patientsRepository.findById(patientId, tenantId);
    return `${patient.firstName} ${patient.lastName}`;
  }

  private async resolveDoctorName(doctorId: string | null): Promise<string | null> {
    if (!doctorId) return null;
    const doctor = await this.usersRepository.findById(doctorId);
    return doctor ? `${doctor.firstName} ${doctor.lastName}` : null;
  }
}
