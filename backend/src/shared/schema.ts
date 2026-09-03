import { z } from "zod";

export interface CouchDocument {
  _id: string;
  _rev?: string;
  type: string;
  tenantId: string;
}

export interface User { id: string; username: string; password: string; firstName: string; lastName: string; email: string | null; role: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien" | "platform_admin"; tenantId: string | null; isActive: boolean; service: string | null; specialty: string | null; matricule: string | null; fonction: string | null; photoS3Key: string | null; createdAt: Date }
export interface InsertUser { id?: string; username: string; password: string; firstName: string; lastName: string; email?: string | null; role?: User["role"]; tenantId: string | null; isActive?: boolean; service?: string | null; specialty?: string | null; matricule?: string | null; fonction?: string | null }

export interface Tenant { id: string; name: string; address: string | null; phone: string | null; email: string | null; settings: unknown; isActive: boolean; createdAt: Date }
export interface InsertTenant { id?: string; name: string; address?: string | null; phone?: string | null; email?: string | null; settings?: unknown; isActive?: boolean }

export type PatientStatus = "actif" | "inactif" | "hospitalise";
export type PatientType = "externe" | "hospitalise" | "urgence";
export type PaymentMode = "assurance" | "mutuelle" | "tiers_payant" | "comptant";
export type IdDocumentType = "cni" | "passeport" | "permis" | "anip" | "autre";
export type AllergyKnowledge = "aucune_connue" | "allergies_connues" | "non_renseigne";

export interface EmergencyContact { name: string; relation: string; relationOther: string | null; phone: string; address: string | null; isPriority: boolean }
export interface PediatricInfo { fatherName: string | null; motherName: string | null; legalGuardian: string | null; guardianPhone: string | null; guardianRelation: string | null; guardianRelationOther: string | null; weightKg: string | null; heightCm: string | null; birthInfo: string | null; vaccinations: string | null }

export interface Patient { id: string; tenantId: string; dossierNumber: string | null; lastName: string; firstName: string; searchName: string; dateOfBirth: string; sex: "M" | "F"; primaryPhone: string; residenceAddress: string; usualName: string | null; birthPlace: string | null; nationality: string | null; profession: string | null; maritalStatus: string | null; idDocumentType: IdDocumentType | null; idDocumentTypeOther: string | null; idDocumentNumber: string | null; idDocumentExpiry: string | null; email: string | null; secondaryPhone: string | null; residenceZone: string | null; fullAddress: string | null; emergencyContact: EmergencyContact | null; bloodGroup: string | null; allergyKnowledge: AllergyKnowledge; allergyDetails: string | null; medicalHistory: string | null; surgicalHistory: string | null; chronicDiseases: string | null; currentTreatments: string | null; disabilities: string | null; facilityService: string | null; referringDoctorId: string | null; patientType: PatientType; paymentMode: PaymentMode | null; insuranceName: string | null; insuranceNumber: string | null; financiallyResponsible: string | null; pediatricInfo: PediatricInfo | null; photoS3Key: string | null; status: PatientStatus; isActive: boolean; createdAt: Date; updatedAt: Date }
export interface InsertPatient { id?: string; lastName: string; firstName: string; dateOfBirth: string; sex: "M" | "F"; primaryPhone: string; residenceAddress: string; usualName?: string | null; birthPlace?: string | null; nationality?: string | null; profession?: string | null; maritalStatus?: string | null; idDocumentType?: IdDocumentType | null; idDocumentTypeOther?: string | null; idDocumentNumber?: string | null; idDocumentExpiry?: string | null; email?: string | null; secondaryPhone?: string | null; residenceZone?: string | null; fullAddress?: string | null; emergencyContact?: EmergencyContact | null; bloodGroup?: string | null; allergyKnowledge?: AllergyKnowledge; allergyDetails?: string | null; medicalHistory?: string | null; surgicalHistory?: string | null; chronicDiseases?: string | null; currentTreatments?: string | null; disabilities?: string | null; facilityService?: string | null; referringDoctorId?: string | null; patientType?: PatientType; paymentMode?: PaymentMode | null; insuranceName?: string | null; insuranceNumber?: string | null; financiallyResponsible?: string | null; pediatricInfo?: PediatricInfo | null; tenantId: string }

export type ConsultationStatus = "planifiee" | "en_attente" | "en_cours" | "terminee" | "annulee";
export type ConsultationPriority = "normal" | "urgent" | "tres_urgent";

export interface VitalSigns {
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  heartRate: number | null;
  temperature: number | null;
  oxygenSaturation: number | null;
  respiratoryRate: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  capillaryGlycemia: number | null;
  painScoreEva: number | null;
  isPregnant: boolean | null;
}

export type ExamSystem = "cardiovasculaire" | "respiratoire" | "neurologique" | "digestif" | "orl" | "dermatologique";
export type ExamSystemStatus = "normal" | "anormal" | "non_examine";

export interface SystemExamFinding {
  system: ExamSystem;
  status: ExamSystemStatus;
  notes: string | null;
}

export interface PhysicalExam {
  generalState: string | null;
  consciousness: string | null;
  hydration: string | null;
  systemFindings: SystemExamFinding[];
}

export type DiagnosisCertainty = "confirme" | "suspecte";
export interface DiagnosisPrincipal {
  label: string;
  certainty: DiagnosisCertainty;
}

export type RoomStatus = "disponible" | "en_maintenance";
export type RoomEffectiveStatus = "occupee" | "reservee" | "disponible" | "en_maintenance";

export interface Room { id: string; tenantId: string; number: string; type: string; floor: string | null; capacity: number; equipment: string[]; notes: string | null; status: RoomStatus; createdAt: Date; updatedAt: Date }
export interface InsertRoom { id?: string; number: string; type: string; floor?: string | null; capacity: number; equipment?: string[]; notes?: string | null; status?: RoomStatus; tenantId: string }

export type ExamTypeCategory = "laboratoire" | "imagerie" | "explorations_fonctionnelles" | "autre";
export interface ExamTypeParameter { name: string; unit: string | null; referenceRange: string | null }
export interface ExamType { id: string; tenantId: string; name: string; category: ExamTypeCategory; isActive: boolean; parameters: ExamTypeParameter[]; createdAt: Date; updatedAt: Date }
export interface InsertExamType { id?: string; name: string; category: ExamTypeCategory; isActive?: boolean; parameters?: ExamTypeParameter[]; tenantId: string }

export interface Service { id: string; tenantId: string; name: string; isActive: boolean; createdAt: Date; updatedAt: Date }
export interface InsertService { id?: string; name: string; isActive?: boolean; tenantId: string }

export interface Consultation { id: string; tenantId: string; number: string | null; patientId: string; scheduledAt: Date; specialty: string; assignedDoctorId: string; roomId: string | null; priority: ConsultationPriority; reason: string; nurseNotes: string | null; symptoms: string | null; vitals: VitalSigns | null; vitalsRecordedAt: Date | null; relevantHistory: string[]; presentIllnessHistory: string | null; physicalExam: PhysicalExam | null; diagnosisPrincipal: DiagnosisPrincipal | null; diagnosisSecondary: string[]; diagnosisHypothesis: string | null; medicalConsultationSavedAt: Date | null; carePlan: CarePlan | null; carePlanSavedAt: Date | null; examInterpretation: string | null; examDecision: string | null; examsReviewedAt: Date | null; closedAt: Date | null; status: ConsultationStatus; createdAt: Date; updatedAt: Date }
export interface InsertConsultation { id?: string; patientId: string; scheduledAt: Date | string; specialty: string; assignedDoctorId: string; roomId?: string | null; priority?: ConsultationPriority; reason: string; nurseNotes?: string | null; tenantId: string }

export type CarePlanOrientation = "retour_domicile" | "controle_suivi" | "hospitalisation" | "orientation_specialiste" | "transfert_urgent" | "autre";

export interface CarePlanRetourDomicile {
  orientation: "retour_domicile";
  medicalRecommendations: string;
  patientInstructions: string;
}

export interface CarePlanControleSuivi {
  orientation: "controle_suivi";
  medicalRecommendations: string;
  patientInstructions: string;
  appointmentDate: string;
  specialty: string;
  doctor: string;
  followUpReason: string;
}

export interface CarePlanHospitalisation {
  orientation: "hospitalisation";
  targetService: string;
  estimatedStayDuration: string;
  admissionReason: string;
  bedUrgentlyRequired: boolean;
  familyNotified: boolean;
  preAdmissionInstructions: string;
}

export interface CarePlanOrientationSpecialiste {
  orientation: "orientation_specialiste";
  recommendedSpecialty: string;
  recommendedDoctorOrFacility: string;
  clinicalReason: string;
  urgencyLevel: "routine" | "semi_urgent" | "urgent";
  generateReferralLetter: boolean;
  attachedDocuments: string[];
}

export interface CarePlanTransfertUrgent {
  orientation: "transfert_urgent";
  destinationFacility: string;
  vitalUrgencyLevel: string;
  medicalReason: string;
  transportType: "ambulance_simple" | "ambulance_medicalisee" | "samu_smur";
  onCallDoctorContacted: boolean;
  estimatedDepartureTime: string;
}

export interface CarePlanAutre {
  orientation: "autre";
  decisionType: string;
  reevaluationFrequency: string;
  description: string;
  followUpNeeded: boolean;
  involvedParties: string[];
}

export type CarePlan =
  | CarePlanRetourDomicile
  | CarePlanControleSuivi
  | CarePlanHospitalisation
  | CarePlanOrientationSpecialiste
  | CarePlanTransfertUrgent
  | CarePlanAutre;

export type LabOrderFollowUpAction = "aucune_action" | "contacter_patient" | "modifier_traitement" | "programmer_rdv" | "nouvel_examen";

export type LabOrderStatus = "demande" | "en_cours" | "a_valider" | "termine" | "probleme_signale" | "annule";

export type ExamResultStatus = "normal" | "bas" | "eleve" | "anormal";

export interface LabResultParameter { name: string; unit: string | null; referenceRange: string | null; value: string | null; status: ExamResultStatus | null }

export interface LabOrderExamLine { examName: string; resultText: string | null; parameters: LabResultParameter[] }

export interface LabOrderAttachment { id: string; fileName: string; contentType: string; s3Key: string; uploadedAt: Date }

export interface LabOrder {
  id: string;
  tenantId: string;
  consultationId: string;
  patientId: string;
  examLines: LabOrderExamLine[];
  requestedByUserId: string;
  requestedAt: Date;
  priority: "normal" | "urgent";
  clinicalContext: string | null;
  specialInstructions: string | null;
  labComment: string | null;
  attachments: LabOrderAttachment[];
  status: LabOrderStatus;
  takenInChargeByUserId: string | null;
  takenInChargeAt: Date | null;
  validatedByUserId: string | null;
  validatedAt: Date | null;
  problemReport: string | null;
  followUpAction: LabOrderFollowUpAction | null;
  followUpNote: string | null;
  followUpRecordedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertLabOrder {
  id?: string;
  tenantId: string;
  consultationId: string;
  examLines: { examName: string; parameters?: ExamTypeParameter[] }[];
  priority?: "normal" | "urgent";
  clinicalContext?: string | null;
  specialInstructions?: string | null;
  requestedByUserId: string;
}

export type PrescriptionStatus = "en_attente" | "prepare" | "delivre" | "delivre_partiel" | "annule";
export type DispenseStatus = "en_attente" | "delivre" | "indisponible";

export interface PrescriptionLine {
  drugName: string;
  dosage: string;
  frequency: string;
  durationDays: number | null;
  quantity: string | null;
  dispenseStatus: DispenseStatus;
}

export interface Prescription {
  id: string;
  tenantId: string;
  consultationId: string;
  patientId: string;
  lines: PrescriptionLine[];
  prescribedByUserId: string;
  prescribedAt: Date;
  status: PrescriptionStatus;
  dispensedByUserId: string | null;
  dispensedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertPrescription {
  id?: string;
  tenantId: string;
  consultationId: string;
  lines: { drugName: string; dosage: string; frequency: string; durationDays?: number | null; quantity?: string | null }[];
  prescribedByUserId: string;
}

export type QueueEventType = "arrived" | "registered" | "waiting" | "called" | "in_care" | "in_consultation" | "completed" | "cancelled" | "transferred" | "priority_changed";
export interface QueueEventPayload { priority: ConsultationPriority | null; targetService: string | null }
export interface QueueEvent { id: string; tenantId: string; consultationId: string; patientId: string; eventType: QueueEventType; payload: QueueEventPayload | null; actorUserId: string; actorDeviceId: string | null; occurredAt: Date }
export interface InsertQueueEvent { id?: string; consultationId: string; patientId: string; eventType: QueueEventType; payload?: QueueEventPayload | null; actorUserId: string; actorDeviceId?: string | null; tenantId: string }
export interface QueueTimelineEntry { eventType: QueueEventType; occurredAt: string }
export interface QueueItem { consultationId: string; patientId: string; status: QueueEventType; priority: ConsultationPriority; waitingSinceMs: number | null; timeline: QueueTimelineEntry[] }

export type SyncState = "online" | "offline" | "syncing" | "error";
export interface SyncStatus { id: string; tenantId: string; deviceId: string; lastSync: Date | null; status: SyncState; pendingChanges: number }
export interface InsertSyncStatus { id?: string; tenantId: string; deviceId: string; lastSync?: Date | string | null; status?: SyncState; pendingChanges?: number }

export interface Setting { id: string; tenantId: string; key: string; value: string; category: string; dataType: string; isEncrypted: boolean; createdAt: Date; updatedAt: Date }
export interface InsertSetting { id?: string; tenantId?: string; key: string; value: string; category?: string; dataType?: string; isEncrypted?: boolean }

export interface AuditLog { id: string; userId: string; tenantId: string; action: "CREATE" | "UPDATE" | "DELETE" | "PATCH"; entityType: string; entityId: string | null; requestBody: unknown; responseBody: unknown; changes: unknown; metadata: unknown; status: "SUCCESS" | "FAILED"; errorMessage: string | null; createdAt: Date }
export interface InsertAuditLog extends Omit<AuditLog, "id" | "createdAt" | "entityId" | "requestBody" | "responseBody" | "changes" | "errorMessage"> { id?: string; entityId?: string | null; requestBody?: unknown; responseBody?: unknown; changes?: unknown; errorMessage?: string | null }

const id = z.string().uuid().optional();
const nullableString = z.string().nullable().optional();

export const insertUserSchema = z.object({ id, username: z.string().min(1), password: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: nullableString, role: z.enum(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien", "platform_admin"]).optional(), tenantId: z.string().nullable(), isActive: z.boolean().optional(), service: nullableString, specialty: nullableString, matricule: nullableString, fonction: nullableString });
export const insertTenantSchema = z.object({ id, name: z.string().min(1), address: nullableString, phone: nullableString, email: nullableString, settings: z.unknown().optional(), isActive: z.boolean().optional() });
const emergencyContactSchema = z.object({ name: z.string().min(1), relation: z.string().min(1), relationOther: nullableString, phone: z.string().min(1), address: nullableString, isPriority: z.boolean().optional().default(false) }).nullable().optional();
const pediatricInfoSchema = z.object({ fatherName: nullableString, motherName: nullableString, legalGuardian: nullableString, guardianPhone: nullableString, guardianRelation: nullableString, guardianRelationOther: nullableString, weightKg: nullableString, heightCm: nullableString, birthInfo: nullableString, vaccinations: nullableString }).nullable().optional();
export const insertPatientSchema = z.object({ id, lastName: z.string().min(1), firstName: z.string().min(1), dateOfBirth: z.string().min(1), sex: z.enum(["M", "F"]), primaryPhone: z.string().min(1), residenceAddress: z.string().min(1), usualName: nullableString, birthPlace: nullableString, nationality: nullableString, profession: nullableString, maritalStatus: nullableString, idDocumentType: z.enum(["cni", "passeport", "permis", "anip", "autre"]).nullable().optional(), idDocumentTypeOther: nullableString, idDocumentNumber: nullableString, idDocumentExpiry: nullableString, email: nullableString, secondaryPhone: nullableString, residenceZone: nullableString, fullAddress: nullableString, emergencyContact: emergencyContactSchema, bloodGroup: nullableString, allergyKnowledge: z.enum(["aucune_connue", "allergies_connues", "non_renseigne"]).optional(), allergyDetails: nullableString, medicalHistory: nullableString, surgicalHistory: nullableString, chronicDiseases: nullableString, currentTreatments: nullableString, disabilities: nullableString, facilityService: nullableString, referringDoctorId: nullableString, patientType: z.enum(["externe", "hospitalise", "urgence"]).optional(), paymentMode: z.enum(["assurance", "mutuelle", "tiers_payant", "comptant"]).nullable().optional(), insuranceName: nullableString, insuranceNumber: nullableString, financiallyResponsible: nullableString, pediatricInfo: pediatricInfoSchema, tenantId: z.string() });
export const insertServiceSchema = z.object({ id, name: z.string().min(1), isActive: z.boolean().optional(), tenantId: z.string() });
export const insertConsultationSchema = z.object({ id, patientId: z.string().min(1), scheduledAt: z.union([z.date(), z.string()]), specialty: z.string().min(1), assignedDoctorId: z.string().min(1), roomId: nullableString, priority: z.enum(["normal", "urgent", "tres_urgent"]).optional(), reason: z.string().min(1), nurseNotes: nullableString, tenantId: z.string() });
export const insertRoomSchema = z.object({ id, number: z.string().min(1), type: z.string().min(1), floor: nullableString, capacity: z.number().int().min(1), equipment: z.array(z.string()).optional(), notes: nullableString, status: z.enum(["disponible", "en_maintenance"]).optional(), tenantId: z.string() });
export const insertSyncStatusSchema = z.object({ id, tenantId: z.string(), deviceId: z.string(), lastSync: z.union([z.date(), z.string()]).nullable().optional(), status: z.enum(["online", "offline", "syncing", "error"]).optional(), pendingChanges: z.number().int().optional() });
export const insertSettingSchema = z.object({ id, tenantId: z.string().optional(), key: z.string().min(1), value: z.string(), category: z.string().optional(), dataType: z.string().optional(), isEncrypted: z.boolean().optional() });
export const insertAuditLogSchema = z.object({ id, userId: z.string(), tenantId: z.string(), action: z.enum(["CREATE", "UPDATE", "DELETE", "PATCH"]), entityType: z.string(), entityId: nullableString, requestBody: z.unknown().optional(), responseBody: z.unknown().optional(), changes: z.unknown().optional(), metadata: z.unknown(), status: z.enum(["SUCCESS", "FAILED"]), errorMessage: nullableString });
