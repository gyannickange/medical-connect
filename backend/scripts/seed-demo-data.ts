import "dotenv/config";
import * as bcrypt from "bcrypt";
import { CouchDBService } from "../src/database/couchdb.service";
import { TenantsRepository } from "../src/modules/identity/tenants.repository";
import { UsersRepository } from "../src/modules/identity/users.repository";
import { SettingsRepository } from "../src/modules/settings/settings.repository";
import { RoomsRepository } from "../src/modules/rooms/rooms.repository";
import { PatientsRepository } from "../src/modules/patients/patients.repository";
import { ConsultationsRepository } from "../src/modules/consultations/consultations.repository";
import { LabOrdersRepository } from "../src/modules/lab-orders/lab-orders.repository";
import { PrescriptionsRepository } from "../src/modules/prescriptions/prescriptions.repository";
import { QueueRepository } from "../src/modules/queue/queue.repository";
import { AuditRepository } from "../src/modules/audit/audit.repository";
import { DeviceAuthorizationRepository } from "../src/modules/device-authorization/device-authorization.repository";
import { SequenceCounterService } from "../src/lib/sequence-counter.service";
import { S3Service } from "../src/lib/s3.service";
import type {
  CarePlan,
  ConsultationPriority,
  InsertPatient,
  PrescriptionLine,
  PrescriptionStatus,
  QueueEventType,
  User,
} from "@shared/schema";

const DEMO_TENANT_ID = "00000000-0000-4000-8000-0000000000d0";
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

function seedId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

async function findOrUndefined<T>(find: () => Promise<T>): Promise<T | undefined> {
  try {
    return await find();
  } catch (error: any) {
    if (typeof error?.getStatus === "function" && error.getStatus() === 404) return undefined;
    throw error;
  }
}

function daysAgoAt(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysFromNowAt(days: number, hour: number, minute = 0): Date {
  return daysAgoAt(-days, hour, minute);
}

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");

  const couch = new CouchDBService();
  const s3 = new S3Service();
  const sequences = new SequenceCounterService(couch);

  const tenants = new TenantsRepository(couch);
  const users = new UsersRepository(couch, s3);
  const settings = new SettingsRepository(couch);
  const rooms = new RoomsRepository(couch);
  const patients = new PatientsRepository(couch, sequences, s3);
  const consultations = new ConsultationsRepository(couch, sequences, patients);
  const labOrders = new LabOrdersRepository(couch, consultations);
  const prescriptions = new PrescriptionsRepository(couch, consultations);
  const queue = new QueueRepository(couch, consultations);
  const audit = new AuditRepository(couch);
  const devices = new DeviceAuthorizationRepository(couch);

  let tenant = await tenants.findById(DEMO_TENANT_ID);
  const tenantData = {
    name: "Clinique Démo Medical Connect",
    address: "Avenue Jean-Paul II, Cotonou",
    phone: "+229 21 30 45 67",
    email: "contact@clinique-demo.bj",
    settings: { currency: "XOF", timezone: "Africa/Porto-Novo" },
  };
  if (!tenant) {
    ({ tenant } = await tenants.create({
      id: DEMO_TENANT_ID,
      ...tenantData,
    }));
    console.log(`Created demo tenant ${tenant.id}`);
  } else {
    tenant = await tenants.update(tenant.id, tenantData);
  }

  // ---- Staff -------------------------------------------------------------
  // Every field on InsertUser is set explicitly (including email/matricule,
  // which the base db:seed script leaves empty) so staff records look
  // complete in the Staff admin view.
  const STAFF: Array<{
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    role: User["role"];
    service: string;
    specialty: string;
    fonction: string;
    matricule: string;
  }> = [
    { id: seedId(1), username: "admin.demo", firstName: "Admin", lastName: "Démo", email: "admin.demo@clinique-demo.bj", role: "admin", service: "Direction", specialty: "Administration hospitalière", fonction: "Administrateur système", matricule: "EMP-0001" },
    { id: seedId(2), username: "manager.demo", firstName: "Estelle", lastName: "Houngbo", email: "estelle.houngbo@clinique-demo.bj", role: "manager", service: "Direction", specialty: "Gestion des opérations", fonction: "Responsable clinique", matricule: "EMP-0002" },
    { id: seedId(3), username: "accueil.demo", firstName: "Chimène", lastName: "Adjovi", email: "chimene.adjovi@clinique-demo.bj", role: "accueil", service: "Accueil", specialty: "Accueil et orientation patients", fonction: "Agent d'accueil", matricule: "EMP-0003" },
    { id: seedId(4), username: "accueil2.demo", firstName: "Rodrigue", lastName: "Aholou", email: "rodrigue.aholou@clinique-demo.bj", role: "accueil", service: "Accueil", specialty: "Accueil et orientation patients", fonction: "Agent d'accueil", matricule: "EMP-0004" },
    { id: seedId(5), username: "inf.kone", firstName: "Awa", lastName: "Koné", email: "awa.kone@clinique-demo.bj", role: "infirmier", service: "Urgences", specialty: "Soins infirmiers d'urgence", fonction: "Infirmière", matricule: "EMP-0005" },
    { id: seedId(6), username: "inf.diallo", firstName: "Moussa", lastName: "Diallo", email: "moussa.diallo@clinique-demo.bj", role: "infirmier", service: "Pédiatrie", specialty: "Soins infirmiers pédiatriques", fonction: "Infirmier", matricule: "EMP-0006" },
    { id: seedId(7), username: "dr.mbarga", firstName: "Yannick", lastName: "Mbarga", email: "yannick.mbarga@clinique-demo.bj", role: "medecin", service: "Médecine générale", specialty: "Médecine générale", fonction: "Médecin généraliste", matricule: "EMP-0007" },
    { id: seedId(8), username: "dr.fokou", firstName: "Solange", lastName: "Fokou", email: "solange.fokou@clinique-demo.bj", role: "medecin", service: "Cardiologie", specialty: "Cardiologie", fonction: "Cardiologue", matricule: "EMP-0008" },
    { id: seedId(9), username: "dr.toure", firstName: "Ibrahim", lastName: "Touré", email: "ibrahim.toure@clinique-demo.bj", role: "medecin", service: "Pédiatrie", specialty: "Pédiatrie", fonction: "Pédiatre", matricule: "EMP-0009" },
    { id: seedId(10), username: "labo.demo", firstName: "Nadège", lastName: "Zannou", email: "nadege.zannou@clinique-demo.bj", role: "laboratoire", service: "Laboratoire", specialty: "Biologie médicale", fonction: "Technicien de laboratoire", matricule: "EMP-0010" },
    { id: seedId(11), username: "pharma.demo", firstName: "Bertin", lastName: "Agossou", email: "pharma.demo@clinique-demo.bj", role: "pharmacien", service: "Pharmacie", specialty: "Pharmacie clinique", fonction: "Pharmacien", matricule: "EMP-0011" },
  ];

  const staffByUsername = new Map<string, User>();
  for (const s of STAFF) {
    const data = {
      username: s.username,
      password: await bcrypt.hash(SEED_PASSWORD, 10),
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      role: s.role,
      tenantId: tenant.id,
      isActive: true,
      service: s.service,
      specialty: s.specialty,
      matricule: s.matricule,
      fonction: s.fonction,
    };
    const existing = await users.findByUsername(s.username);
    const saved = existing
      ? await users.update(existing.id, tenant.id, data)
      : await users.create({ id: s.id, ...data });
    staffByUsername.set(s.username, saved);
  }
  const staff = (username: string): User => {
    const found = staffByUsername.get(username);
    if (!found) throw new Error(`Seed staff member not found: ${username}`);
    return found;
  };
  console.log(`Seeded ${staffByUsername.size} staff members`);

  // ---- Rooms ---------------------------------------------------------------
  const ROOM_SPECS = [
    { number: "101", type: "Consultation générale", floor: "1", capacity: 1, equipment: ["Table d'examen", "Tensiomètre", "Pèse-personne"], notes: "Salle standard de consultation, équipée pour les examens de routine.", status: "disponible" as const },
    { number: "102", type: "Consultation générale", floor: "1", capacity: 1, equipment: ["Table d'examen", "Tensiomètre"], status: "en_maintenance" as const, notes: "Climatisation en panne, intervention technicien prévue." },
    { number: "103", type: "Cardiologie", floor: "1", capacity: 1, equipment: ["ECG", "Tensiomètre", "Stéthoscope", "Moniteur cardiaque"], notes: "Salle dédiée aux consultations et bilans cardiovasculaires.", status: "disponible" as const },
    { number: "Box U1", type: "Urgences", floor: "RDC", capacity: 2, equipment: ["Chariot d'urgence", "Oxygène", "Défibrillateur", "Moniteur multiparamétrique"], notes: "Box de déchocage, premier box mobilisé aux urgences.", status: "disponible" as const },
    { number: "Box U2", type: "Urgences", floor: "RDC", capacity: 2, equipment: ["Chariot d'urgence", "Oxygène", "Brancard"], notes: "Second box d'urgence, utilisé en cas d'afflux de patients.", status: "disponible" as const },
    { number: "201", type: "Pédiatrie", floor: "2", capacity: 1, equipment: ["Table de pesée bébé", "Toise", "Tensiomètre pédiatrique"], notes: "Salle décorée et adaptée à l'accueil des enfants.", status: "disponible" as const },
    { number: "Salle d'attente A", type: "Salle d'attente", floor: "RDC", capacity: 25, equipment: ["Chaises", "Téléviseur", "Distributeur d'eau"], notes: "Salle d'attente principale, proche de l'accueil.", status: "disponible" as const },
    { number: "Bloc Imagerie", type: "Imagerie", floor: "RDC", capacity: 1, equipment: ["Échographe", "Table d'examen"], status: "en_maintenance" as const, notes: "Maintenance de l'échographe prévue, retour en service estimé sous 48h." },
  ];
  const createdRooms = [];
  for (const [index, r] of ROOM_SPECS.entries()) {
    const id = seedId(100 + index);
    const existing = await findOrUndefined(() => rooms.findById(id, tenant.id));
    createdRooms.push(existing
      ? await rooms.update(id, tenant.id, r)
      : await rooms.create({ id, ...r, tenantId: tenant.id }));
  }
  const room = (index: number) => createdRooms[index];
  console.log(`Seeded ${createdRooms.length} rooms`);

  // ---- Patients --------------------------------------------------------
  // Every InsertPatient field is set for every adult patient. The only
  // fields left null are the ones that are structurally not applicable
  // (pediatricInfo for adults; a birth certificate's idDocumentExpiry;
  // a minor's own email) rather than simply omitted.
  const noKnownIssues = {
    allergyKnowledge: "aucune_connue" as const,
    allergyDetails: "Aucune allergie connue",
    medicalHistory: "RAS",
    surgicalHistory: "Aucun antécédent chirurgical",
    chronicDiseases: "Aucune",
    currentTreatments: "Aucun traitement en cours",
    disabilities: "Aucun handicap",
  };

  const PATIENT_SPECS: InsertPatient[] = [
    {
      lastName: "Agbessi", firstName: "Prudence", usualName: "Prudy", dateOfBirth: "1985-03-12", sex: "F",
      birthPlace: "Cotonou", nationality: "Béninoise", profession: "Commerçante", maritalStatus: "Mariée",
      idDocumentType: "cni", idDocumentNumber: "B00123456", idDocumentExpiry: "2031-03-12",
      primaryPhone: "+229 97 10 22 33", secondaryPhone: "+229 61 10 22 33", email: "prudence.agbessi@gmail.com",
      residenceAddress: "Quartier Fidjrossè, Cotonou", residenceZone: "Fidjrossè", fullAddress: "Lot 245, Quartier Fidjrossè, Cotonou",
      emergencyContact: { name: "Marcel Agbessi", relation: "Époux", phone: "+229 97 10 99 88", address: "Fidjrossè, Cotonou", isPriority: true },
      bloodGroup: "O+", ...noKnownIssues, facilityService: "Médecine générale", patientType: "externe",
      paymentMode: "comptant", financiallyResponsible: "Elle-même", tenantId: tenant.id,
    },
    {
      lastName: "Houngbo", firstName: "Cyrille", usualName: "Cyrille", dateOfBirth: "1978-11-02", sex: "M",
      birthPlace: "Porto-Novo", nationality: "Béninoise", profession: "Chauffeur", maritalStatus: "Marié",
      idDocumentType: "permis", idDocumentNumber: "PC-778812", idDocumentExpiry: "2028-11-02",
      primaryPhone: "+229 96 11 44 55", secondaryPhone: "+229 61 11 44 55", email: "cyrille.houngbo@yahoo.fr",
      residenceAddress: "Akpakpa, Cotonou", residenceZone: "Akpakpa", fullAddress: "Rue 412, Akpakpa, Cotonou",
      emergencyContact: { name: "Bienvenue Houngbo", relation: "Épouse", phone: "+229 96 11 77 66", address: "Akpakpa, Cotonou", isPriority: true },
      bloodGroup: "B+", ...noKnownIssues, surgicalHistory: "Appendicectomie en 2010", facilityService: "Médecine générale", patientType: "externe",
      paymentMode: "mutuelle", insuranceName: "Mutuelle des Transporteurs du Bénin", insuranceNumber: "MTB-2022-4471", financiallyResponsible: "Lui-même", tenantId: tenant.id,
    },
    {
      lastName: "Adjahoui", firstName: "Léonie", usualName: "Léo", dateOfBirth: "1992-07-19", sex: "F",
      birthPlace: "Porto-Novo", nationality: "Béninoise", profession: "Enseignante", maritalStatus: "Célibataire",
      idDocumentType: "cni", idDocumentNumber: "B00551247", idDocumentExpiry: "2030-07-19",
      primaryPhone: "+229 95 22 66 77", secondaryPhone: "+229 61 22 66 77", email: "leonie.adjahoui@gmail.com",
      residenceAddress: "Zongo, Porto-Novo", residenceZone: "Zongo", fullAddress: "Quartier Zongo, près du marché, Porto-Novo",
      emergencyContact: { name: "Solange Adjahoui", relation: "Mère", phone: "+229 95 22 11 09", address: "Porto-Novo", isPriority: true },
      bloodGroup: "AB+", allergyKnowledge: "allergies_connues", allergyDetails: "Pénicilline",
      medicalHistory: "RAS", surgicalHistory: "Aucun antécédent chirurgical", chronicDiseases: "Aucune", currentTreatments: "Aucun traitement en cours", disabilities: "Aucun handicap",
      facilityService: "Cardiologie", patientType: "externe", paymentMode: "comptant", financiallyResponsible: "Elle-même", tenantId: tenant.id,
    },
    {
      lastName: "Kpodar", firstName: "Serge", usualName: "Serge", dateOfBirth: "1966-01-25", sex: "M",
      birthPlace: "Abomey", nationality: "Béninoise", profession: "Fonctionnaire retraité", maritalStatus: "Marié",
      idDocumentType: "cni", idDocumentNumber: "B00998211", idDocumentExpiry: "2029-01-25",
      primaryPhone: "+229 90 33 88 12", secondaryPhone: "+229 61 33 88 12", email: "serge.kpodar@gmail.com",
      residenceAddress: "Godomey, Abomey-Calavi", residenceZone: "Godomey", fullAddress: "Lot 88, Godomey Centre, Abomey-Calavi",
      emergencyContact: { name: "Adèle Kpodar", relation: "Épouse", phone: "+229 90 33 22 44", address: "Godomey, Abomey-Calavi", isPriority: true },
      bloodGroup: "O+", allergyKnowledge: "aucune_connue", allergyDetails: "Aucune allergie connue",
      medicalHistory: "Suivi pour hypertension artérielle depuis 2018", surgicalHistory: "Aucun antécédent chirurgical",
      chronicDiseases: "Hypertension artérielle", currentTreatments: "Amlodipine 5mg par jour", disabilities: "Aucun handicap",
      facilityService: "Cardiologie", patientType: "externe", paymentMode: "mutuelle", insuranceName: "Mutuelle Fonction Publique", insuranceNumber: "MFP-1988-0925",
      financiallyResponsible: "Lui-même", tenantId: tenant.id,
    },
    {
      lastName: "Zinsou", firstName: "Bernadette", usualName: "Bernadette", dateOfBirth: "1955-05-30", sex: "F",
      birthPlace: "Cotonou", nationality: "Béninoise", profession: "Commerçante retraitée", maritalStatus: "Veuve",
      idDocumentType: "cni", idDocumentNumber: "B00456789", idDocumentExpiry: "2027-05-30",
      primaryPhone: "+229 91 44 12 90", secondaryPhone: "+229 61 44 12 90", email: "bernadette.zinsou@gmail.com",
      residenceAddress: "Dantokpa, Cotonou", residenceZone: "Dantokpa", fullAddress: "Marché Dantokpa, Cotonou",
      emergencyContact: { name: "Florent Zinsou", relation: "Fils", phone: "+229 97 44 33 21", address: "Cotonou", isPriority: true },
      bloodGroup: "A+", allergyKnowledge: "aucune_connue", allergyDetails: "Aucune allergie connue",
      medicalHistory: "Diabète de type 2 diagnostiqué en 2015, suivi régulier", surgicalHistory: "Cholécystectomie en 2005",
      chronicDiseases: "Diabète de type 2", currentTreatments: "Metformine 500mg", disabilities: "Aucun handicap",
      facilityService: "Médecine générale", patientType: "externe", paymentMode: "comptant", financiallyResponsible: "Elle-même", tenantId: tenant.id,
    },
    {
      lastName: "Dossou", firstName: "Firmin", usualName: "Firmin", dateOfBirth: "1999-09-09", sex: "M",
      birthPlace: "Cotonou", nationality: "Béninoise", profession: "Étudiant", maritalStatus: "Célibataire",
      idDocumentType: "cni", idDocumentNumber: "B01122334", idDocumentExpiry: "2032-09-09",
      primaryPhone: "+229 97 55 20 44", secondaryPhone: "+229 61 55 20 44", email: "firmin.dossou@gmail.com",
      residenceAddress: "Cadjehoun, Cotonou", residenceZone: "Cadjehoun", fullAddress: "Rue 210, Cadjehoun, Cotonou",
      emergencyContact: { name: "Régine Dossou", relation: "Mère", phone: "+229 97 55 10 22", address: "Cadjehoun, Cotonou", isPriority: true },
      bloodGroup: "O-", ...noKnownIssues, facilityService: "Médecine générale", patientType: "externe",
      paymentMode: "comptant", financiallyResponsible: "Ses parents", tenantId: tenant.id,
    },
    {
      lastName: "Tchibozo", firstName: "Aïcha", usualName: "Aïcha", dateOfBirth: "2003-12-01", sex: "F",
      birthPlace: "Porto-Novo", nationality: "Béninoise", profession: "Étudiante", maritalStatus: "Célibataire",
      idDocumentType: "cni", idDocumentNumber: "B01345567", idDocumentExpiry: "2033-12-01",
      primaryPhone: "+229 96 66 30 21", secondaryPhone: "+229 61 66 30 21", email: "aicha.tchibozo@gmail.com",
      residenceAddress: "Ouando, Porto-Novo", residenceZone: "Ouando", fullAddress: "Quartier Ouando, Porto-Novo",
      emergencyContact: { name: "Rachidatou Tchibozo", relation: "Mère", phone: "+229 96 66 10 09", address: "Porto-Novo", isPriority: true },
      bloodGroup: "A-", ...noKnownIssues, facilityService: "Médecine générale", patientType: "externe",
      paymentMode: "tiers_payant", financiallyResponsible: "Ses parents", tenantId: tenant.id,
    },
    {
      lastName: "Amoussou", firstName: "Régis", usualName: "Régis", dateOfBirth: "1988-04-17", sex: "M",
      birthPlace: "Cotonou", nationality: "Béninoise", profession: "Mécanicien", maritalStatus: "Marié",
      idDocumentType: "cni", idDocumentNumber: "B01556678", idDocumentExpiry: "2030-04-17",
      primaryPhone: "+229 95 77 40 88", secondaryPhone: "+229 61 77 40 88", email: "regis.amoussou@gmail.com",
      residenceAddress: "Sainte-Rita, Cotonou", residenceZone: "Sainte-Rita", fullAddress: "Rue 305, Sainte-Rita, Cotonou",
      emergencyContact: { name: "Clarisse Amoussou", relation: "Épouse", phone: "+229 95 77 55 33", address: "Sainte-Rita, Cotonou", isPriority: true },
      bloodGroup: "B-", ...noKnownIssues, facilityService: "Urgences", patientType: "urgence",
      paymentMode: "comptant", financiallyResponsible: "Lui-même", tenantId: tenant.id,
    },
    {
      lastName: "Sossou", firstName: "Clémence", usualName: "Clémence", dateOfBirth: "2019-06-05", sex: "F",
      birthPlace: "Abomey-Calavi", nationality: "Béninoise", profession: "Sans emploi (enfant)", maritalStatus: "Non applicable (enfant)",
      idDocumentType: "autre", idDocumentNumber: "Extrait de naissance n°2019-0456", idDocumentExpiry: null,
      primaryPhone: "+229 90 88 51 66", secondaryPhone: "+229 90 88 22 11", email: null,
      residenceAddress: "Akassato, Abomey-Calavi", residenceZone: "Akassato", fullAddress: "Lot 12, Akassato, Abomey-Calavi",
      emergencyContact: { name: "Gérard Sossou", relation: "Père", phone: "+229 90 88 51 66", address: "Akassato, Abomey-Calavi", isPriority: true },
      bloodGroup: "O+", ...noKnownIssues, facilityService: "Pédiatrie", patientType: "externe",
      paymentMode: "mutuelle", insuranceName: "CNSS - Ayant droit", insuranceNumber: "CNSS-778812-02", financiallyResponsible: "Gérard Sossou (Père)",
      pediatricInfo: { fatherName: "Gérard Sossou", motherName: "Huguette Sossou", legalGuardian: null, guardianPhone: "+229 90 88 51 66", guardianRelation: "Mère", weightKg: "16.5", heightCm: "98", birthInfo: "Née à terme, accouchement normal", vaccinations: "PEV à jour" },
      tenantId: tenant.id,
    },
    {
      lastName: "Gbaguidi", firstName: "Wilfried", usualName: "Wilfried", dateOfBirth: "2016-02-14", sex: "M",
      birthPlace: "Cotonou", nationality: "Béninoise", profession: "Sans emploi (enfant)", maritalStatus: "Non applicable (enfant)",
      idDocumentType: "autre", idDocumentNumber: "Extrait de naissance n°2016-1123", idDocumentExpiry: null,
      primaryPhone: "+229 91 99 62 77", secondaryPhone: "+229 91 99 11 22", email: null,
      residenceAddress: "Vêdoko, Cotonou", residenceZone: "Vêdoko", fullAddress: "Rue 88, Vêdoko, Cotonou",
      emergencyContact: { name: "Anicet Gbaguidi", relation: "Père", phone: "+229 91 99 62 77", address: "Vêdoko, Cotonou", isPriority: true },
      bloodGroup: "A+", ...noKnownIssues, facilityService: "Pédiatrie", patientType: "externe",
      paymentMode: "comptant", financiallyResponsible: "Anicet Gbaguidi (Père)",
      pediatricInfo: { fatherName: "Anicet Gbaguidi", motherName: "Séverine Gbaguidi", legalGuardian: null, guardianPhone: "+229 91 99 62 77", guardianRelation: "Père", weightKg: "22", heightCm: "112", birthInfo: null, vaccinations: "PEV à jour" },
      tenantId: tenant.id,
    },
    {
      lastName: "Alapini", firstName: "Marceline", usualName: "Marceline", dateOfBirth: "1970-10-08", sex: "F",
      birthPlace: "Cotonou", nationality: "Béninoise", profession: "Retraitée", maritalStatus: "Veuve",
      idDocumentType: "cni", idDocumentNumber: "B00223344", idDocumentExpiry: "2028-10-08",
      primaryPhone: "+229 97 20 73 15", secondaryPhone: "+229 61 20 73 15", email: "marceline.alapini@gmail.com",
      residenceAddress: "Missèbo, Cotonou", residenceZone: "Missèbo", fullAddress: "Rue 12, Missèbo, Cotonou",
      emergencyContact: { name: "Judicaël Alapini", relation: "Fils", phone: "+229 97 21 40 09", address: "Missèbo, Cotonou", isPriority: true },
      bloodGroup: "AB-", allergyKnowledge: "allergies_connues", allergyDetails: "Iode (produits de contraste)",
      medicalHistory: "Opérée de la cataracte en 2021", surgicalHistory: "Chirurgie de la cataracte (2021)",
      chronicDiseases: "Arthrose", currentTreatments: "Paracétamol au besoin", disabilities: "Aucun handicap",
      facilityService: "Médecine générale", patientType: "externe", paymentMode: "assurance", insuranceName: "ASKY Assurances", insuranceNumber: "AS-2024-8834",
      financiallyResponsible: "Elle-même", referringDoctorId: staff("dr.mbarga").id, tenantId: tenant.id,
    },
    {
      lastName: "Hounkpatin", firstName: "Éric", usualName: "Éric", dateOfBirth: "1994-08-22", sex: "M",
      birthPlace: "Abomey-Calavi", nationality: "Béninoise", profession: "Comptable", maritalStatus: "Célibataire",
      idDocumentType: "passeport", idDocumentNumber: "P0234567", idDocumentExpiry: "2029-08-22",
      primaryPhone: "+229 96 30 84 12", secondaryPhone: "+229 61 30 84 12", email: "eric.hounkpatin@gmail.com",
      residenceAddress: "Calavi Centre, Abomey-Calavi", residenceZone: "Calavi Centre", fullAddress: "Rue 45, Calavi Centre, Abomey-Calavi",
      emergencyContact: { name: "Fabrice Hounkpatin", relation: "Frère", phone: "+229 96 30 11 22", address: "Abomey-Calavi", isPriority: true },
      bloodGroup: "O+", allergyKnowledge: "aucune_connue", allergyDetails: "Aucune allergie connue",
      medicalHistory: "Suites d'une appendicectomie récente", surgicalHistory: "Appendicectomie (2026)",
      chronicDiseases: "Aucune", currentTreatments: "Aucun traitement en cours", disabilities: "Aucun handicap",
      facilityService: "Médecine générale", patientType: "externe", paymentMode: "tiers_payant", insuranceName: "Assurance employeur - ASKY", insuranceNumber: "EMP-TP-3391",
      financiallyResponsible: "Lui-même", tenantId: tenant.id,
    },
    {
      lastName: "Djossou", firstName: "Fabiola", usualName: "Fabiola", dateOfBirth: "1980-01-15", sex: "F",
      birthPlace: "Cotonou", nationality: "Béninoise", profession: "Couturière", maritalStatus: "Mariée",
      idDocumentType: "cni", idDocumentNumber: "B00667788", idDocumentExpiry: "2031-01-15",
      primaryPhone: "+229 95 40 95 23", secondaryPhone: "+229 61 40 95 23", email: "fabiola.djossou@gmail.com",
      residenceAddress: "Jonquet, Cotonou", residenceZone: "Jonquet", fullAddress: "Rue 19, Jonquet, Cotonou",
      emergencyContact: { name: "Innocent Djossou", relation: "Époux", phone: "+229 95 40 11 22", address: "Jonquet, Cotonou", isPriority: true },
      bloodGroup: "B+", allergyKnowledge: "aucune_connue", allergyDetails: "Aucune allergie connue",
      medicalHistory: "Diabète de type 2 en cours d'équilibrage", surgicalHistory: "Aucun antécédent chirurgical",
      chronicDiseases: "Diabète de type 2", currentTreatments: "Metformine 500mg, en cours de réévaluation", disabilities: "Aucun handicap",
      facilityService: "Médecine générale", patientType: "hospitalise", paymentMode: "mutuelle", insuranceName: "Mutuelle des Artisans", insuranceNumber: "MA-2019-2207",
      financiallyResponsible: "Elle-même", tenantId: tenant.id,
    },
    {
      lastName: "Sonon", firstName: "Josué", usualName: "Josué", dateOfBirth: "2010-03-03", sex: "M",
      birthPlace: "Cotonou", nationality: "Béninoise", profession: "Élève", maritalStatus: "Non applicable (enfant)",
      idDocumentType: "autre", idDocumentNumber: "Extrait de naissance n°2010-0789", idDocumentExpiry: null,
      primaryPhone: "+229 90 50 06 34", secondaryPhone: "+229 90 50 11 22", email: null,
      residenceAddress: "Houéyiho, Cotonou", residenceZone: "Houéyiho", fullAddress: "Rue 77, Houéyiho, Cotonou",
      emergencyContact: { name: "Théophile Sonon", relation: "Père", phone: "+229 90 50 06 34", address: "Houéyiho, Cotonou", isPriority: true },
      bloodGroup: "A+", ...noKnownIssues, facilityService: "Pédiatrie", patientType: "externe",
      paymentMode: "comptant", financiallyResponsible: "Théophile Sonon (Père)",
      pediatricInfo: { fatherName: "Théophile Sonon", motherName: "Colette Sonon", legalGuardian: null, guardianPhone: "+229 90 50 06 34", guardianRelation: "Père", weightKg: "31", heightCm: "134", birthInfo: null, vaccinations: "PEV à jour" },
      tenantId: tenant.id,
    },
    {
      lastName: "Kèkè", firstName: "Solange", usualName: "Solange", dateOfBirth: "1963-06-27", sex: "F",
      birthPlace: "Parakou", nationality: "Béninoise", profession: "Retraitée (fonction publique)", maritalStatus: "Veuve",
      idDocumentType: "cni", idDocumentNumber: "B00778899", idDocumentExpiry: "2027-06-27",
      primaryPhone: "+229 91 60 17 45", secondaryPhone: "+229 61 60 17 45", email: "solange.keke@gmail.com",
      residenceAddress: "Agla, Cotonou", residenceZone: "Agla", fullAddress: "Rue 33, Agla, Cotonou",
      emergencyContact: { name: "Prisca Kèkè", relation: "Fille", phone: "+229 91 60 22 11", address: "Agla, Cotonou", isPriority: true },
      bloodGroup: "AB+", allergyKnowledge: "allergies_connues", allergyDetails: "Poussière, pollen",
      medicalHistory: "Asthme allergique suivi depuis 10 ans", surgicalHistory: "Aucun antécédent chirurgical",
      chronicDiseases: "Asthme", currentTreatments: "Salbutamol spray au besoin", disabilities: "Aucun handicap",
      facilityService: "Cardiologie", patientType: "externe", paymentMode: "mutuelle", insuranceName: "Mutuelle Fonction Publique", insuranceNumber: "MFP-1963-1187",
      financiallyResponsible: "Elle-même", tenantId: tenant.id,
    },
    {
      lastName: "Vodounnou", firstName: "Patrice", usualName: "Patrice", dateOfBirth: "1991-11-11", sex: "M",
      birthPlace: "Abomey-Calavi", nationality: "Béninoise", profession: "Électricien", maritalStatus: "Célibataire",
      idDocumentType: "cni", idDocumentNumber: "B00889900", idDocumentExpiry: "2032-11-11",
      primaryPhone: "+229 96 70 28 56", secondaryPhone: "+229 61 70 28 56", email: "patrice.vodounnou@gmail.com",
      residenceAddress: "Womey, Abomey-Calavi", residenceZone: "Womey", fullAddress: "Rue 21, Womey, Abomey-Calavi",
      emergencyContact: { name: "Odile Vodounnou", relation: "Sœur", phone: "+229 96 70 11 22", address: "Womey, Abomey-Calavi", isPriority: true },
      bloodGroup: "O+", ...noKnownIssues, facilityService: "Cardiologie", patientType: "externe",
      paymentMode: "comptant", financiallyResponsible: "Lui-même", tenantId: tenant.id,
    },
  ];
  const createdPatients = [];
  for (const [index, p] of PATIENT_SPECS.entries()) {
    const id = seedId(200 + index);
    const existing = await findOrUndefined(() => patients.findById(id, tenant.id));
    createdPatients.push(existing
      ? await patients.update(id, tenant.id, p)
      : await patients.create({ ...p, id }));
  }
  const patient = (index: number) => createdPatients[index];
  console.log(`Seeded ${createdPatients.length} patients`);

  // ---- Consultations -----------------------------------------------------
  type Status = "planifiee" | "en_attente" | "en_cours" | "terminee" | "annulee";
  interface ConsultationSpec {
    patientIndex: number;
    doctorUsername: string;
    specialty: string;
    roomIndex: number;
    priority: ConsultationPriority;
    reason: string;
    scheduledAt: Date;
    status: Status;
    // Left undefined for "planifiee"/"annulee": those visits haven't
    // happened yet, so no nurse/doctor data legitimately exists for them.
    nurseNotes?: string;
    symptoms?: string;
    relevantHistory?: string[];
    presentIllnessHistory?: string;
    vitals?: Record<string, number | boolean | null>;
    diagnosisPrincipal?: { label: string; certainty: "confirme" | "suspecte" };
    diagnosisSecondary?: string[];
    diagnosisHypothesis?: string;
    // Overrides the generic "all normal" exam findings below for the
    // organ system the diagnosis actually implicates.
    abnormalSystemFinding?: { system: string; notes: string };
    carePlan?: CarePlan;
  }

  const carePlans: CarePlan[] = [
    { orientation: "retour_domicile", medicalRecommendations: "Repos, hydratation abondante, paracétamol si fièvre.", patientInstructions: "Revenir en consultation en cas d'aggravation des symptômes." },
    { orientation: "controle_suivi", medicalRecommendations: "Poursuivre le traitement antihypertenseur.", patientInstructions: "Prendre la tension à domicile chaque matin.", appointmentDate: daysFromNowAt(14, 9).toISOString().slice(0, 10), specialty: "Cardiologie", doctor: "Dr. Solange Fokou", followUpReason: "Contrôle de la tension artérielle" },
    { orientation: "hospitalisation", targetService: "Médecine interne", estimatedStayDuration: "3 à 5 jours", admissionReason: "Décompensation diabétique à surveiller", bedUrgentlyRequired: false, familyNotified: true, preAdmissionInstructions: "À jeun, bilan sanguin complet à l'admission." },
    { orientation: "orientation_specialiste", recommendedSpecialty: "Cardiologie", recommendedDoctorOrFacility: "CNHU Cotonou", clinicalReason: "Souffle cardiaque à explorer", urgencyLevel: "semi_urgent", generateReferralLetter: true, attachedDocuments: [] },
    { orientation: "transfert_urgent", destinationFacility: "CNHU Hubert Koutoukou Maga", vitalUrgencyLevel: "Instable", medicalReason: "Suspicion d'accident vasculaire cérébral", transportType: "ambulance_medicalisee", onCallDoctorContacted: true, estimatedDepartureTime: "15 minutes" },
    { orientation: "autre", decisionType: "Surveillance ambulatoire", reevaluationFrequency: "Hebdomadaire", description: "Suivi post-opératoire simple, pansement à refaire à domicile.", followUpNeeded: true, involvedParties: ["Infirmier à domicile"] },
  ];

  const baseVitals = { bloodPressureSystolic: 120, bloodPressureDiastolic: 80, heartRate: 78, temperature: 37.1, oxygenSaturation: 98, respiratoryRate: 16, weightKg: 68, heightCm: 170, bmi: 23.5, capillaryGlycemia: 0.95, painScoreEva: 1, isPregnant: null };

  const CONSULTATION_SPECS: ConsultationSpec[] = [
    { patientIndex: 0, doctorUsername: "dr.mbarga", specialty: "Médecine générale", roomIndex: 0, priority: "normal", reason: "Douleurs abdominales", scheduledAt: daysAgoAt(6, 9), status: "terminee",
      nurseNotes: "Patiente algique, EVA 5/10. Installée en salle 101.", symptoms: "Douleurs abdominales diffuses, nausées, deux épisodes de diarrhée depuis hier.",
      relevantHistory: ["Aucun antécédent médical notable"], presentIllnessHistory: "Douleurs apparues il y a 24h après un repas pris à l'extérieur, associées à des nausées et un épisode fébrile.",
      vitals: { ...baseVitals, temperature: 38.2 }, diagnosisPrincipal: { label: "Gastro-entérite aiguë", certainty: "confirme" }, diagnosisSecondary: [], diagnosisHypothesis: "Origine alimentaire probable",
      abnormalSystemFinding: { system: "digestif", notes: "Abdomen souple mais sensible en fosse iliaque droite, bruits hydro-aériques augmentés" }, carePlan: carePlans[0] },
    { patientIndex: 3, doctorUsername: "dr.fokou", specialty: "Cardiologie", roomIndex: 2, priority: "normal", reason: "Suivi tension artérielle", scheduledAt: daysAgoAt(5, 10), status: "terminee",
      nurseNotes: "Patient connu hypertendu, observance du traitement à vérifier.", symptoms: "Céphalées occasionnelles, pas de douleur thoracique.",
      relevantHistory: ["Hypertension artérielle depuis 2018"], presentIllnessHistory: "Tension mal contrôlée depuis 2 semaines malgré le traitement en cours.",
      vitals: { ...baseVitals, bloodPressureSystolic: 158, bloodPressureDiastolic: 96 }, diagnosisPrincipal: { label: "Hypertension artérielle non contrôlée", certainty: "confirme" }, diagnosisSecondary: ["Mauvaise observance thérapeutique suspectée"], diagnosisHypothesis: "Ajustement posologique nécessaire", carePlan: carePlans[1] },
    { patientIndex: 4, doctorUsername: "dr.mbarga", specialty: "Médecine générale", roomIndex: 0, priority: "urgent", reason: "Glycémie très élevée, malaise", scheduledAt: daysAgoAt(4, 14), status: "terminee",
      nurseNotes: "Patiente somnolente à l'arrivée, glycémie capillaire prise en urgence.", symptoms: "Malaise, soif intense, vision floue, faiblesse généralisée.",
      relevantHistory: ["Diabète de type 2 diagnostiqué en 2015"], presentIllnessHistory: "Dégradation progressive sur 3 jours, arrêt partiel du traitement par manque de moyens.",
      vitals: { ...baseVitals, capillaryGlycemia: 3.4, heartRate: 102 }, diagnosisPrincipal: { label: "Décompensation diabétique", certainty: "confirme" }, diagnosisSecondary: ["Déshydratation modérée"], diagnosisHypothesis: "Rupture de traitement antidiabétique", carePlan: carePlans[2] },
    { patientIndex: 3, doctorUsername: "dr.fokou", specialty: "Cardiologie", roomIndex: 2, priority: "normal", reason: "Souffle cardiaque détecté", scheduledAt: daysAgoAt(3, 11), status: "terminee",
      nurseNotes: "Auscultation cardiaque anormale relevée lors du contrôle systématique.", symptoms: "Aucun symptôme rapporté par le patient, découverte fortuite.",
      relevantHistory: ["Hypertension artérielle depuis 2018"], presentIllnessHistory: "Souffle systolique entendu lors de la consultation de suivi de tension, non connu auparavant.",
      vitals: baseVitals, diagnosisPrincipal: { label: "Souffle systolique à explorer", certainty: "suspecte" }, diagnosisSecondary: [], diagnosisHypothesis: "Valvulopathie à confirmer par échocardiographie",
      abnormalSystemFinding: { system: "cardiovasculaire", notes: "Souffle systolique 2/6 au foyer aortique, rythme régulier" }, carePlan: carePlans[3] },
    { patientIndex: 1, doctorUsername: "dr.mbarga", specialty: "Médecine générale", roomIndex: 3, priority: "tres_urgent", reason: "Confusion soudaine, faiblesse d'un côté du corps", scheduledAt: daysAgoAt(2, 8), status: "terminee",
      nurseNotes: "Patient amené en urgence par la famille, prise en charge immédiate au box U1.", symptoms: "Faiblesse du bras et de la jambe gauches, confusion, difficulté à parler apparues brutalement.",
      relevantHistory: ["Aucun antécédent médical connu"], presentIllnessHistory: "Symptômes débutés il y a environ 1h30, installation brutale sans facteur déclenchant identifié.",
      vitals: { ...baseVitals, bloodPressureSystolic: 190, bloodPressureDiastolic: 110 }, diagnosisPrincipal: { label: "Suspicion d'AVC", certainty: "suspecte" }, diagnosisSecondary: ["Poussée hypertensive"], diagnosisHypothesis: "AVC ischémique probable, à confirmer par imagerie",
      abnormalSystemFinding: { system: "neurologique", notes: "Déficit moteur de l'hémicorps gauche, dysarthrie légère" }, carePlan: carePlans[4] },
    { patientIndex: 11, doctorUsername: "dr.mbarga", specialty: "Médecine générale", roomIndex: 0, priority: "normal", reason: "Contrôle post-opératoire", scheduledAt: daysAgoAt(1, 9), status: "terminee",
      nurseNotes: "Pansement vérifié, cicatrisation satisfaisante.", symptoms: "Douleur légère au site opératoire, pas de fièvre.",
      relevantHistory: ["Appendicectomie récente (2026)"], presentIllnessHistory: "Suites opératoires simples à J+7 de l'appendicectomie, contrôle de cicatrisation.",
      vitals: baseVitals, diagnosisPrincipal: { label: "Suites opératoires simples", certainty: "confirme" }, diagnosisSecondary: [], diagnosisHypothesis: "Aucune complication identifiée", carePlan: carePlans[5] },

    { patientIndex: 8, doctorUsername: "dr.toure", specialty: "Pédiatrie", roomIndex: 5, priority: "normal", reason: "Fièvre depuis 2 jours", scheduledAt: daysAgoAt(0, 8, 30), status: "en_cours",
      nurseNotes: "Enfant fébrile, prise en charge par le pédiatre en cours.", symptoms: "Fièvre, irritabilité, légère baisse de l'appétit depuis 2 jours.",
      relevantHistory: ["Vaccinations à jour"], presentIllnessHistory: "Fièvre apparue progressivement, sans autre signe associé pour l'instant.",
      vitals: { ...baseVitals, temperature: 38.9, heartRate: 110, weightKg: 16.5, heightCm: 98, bmi: null } },
    { patientIndex: 9, doctorUsername: "dr.toure", specialty: "Pédiatrie", roomIndex: 5, priority: "normal", reason: "Vaccination et contrôle de croissance", scheduledAt: daysAgoAt(0, 9), status: "en_cours",
      nurseNotes: "Enfant calme, pesée et mensurations effectuées.", symptoms: "Aucun symptôme, consultation de routine.",
      relevantHistory: ["Vaccinations à jour"], presentIllnessHistory: "Consultation de suivi de croissance programmée, pas de plainte particulière.",
      vitals: { ...baseVitals, weightKg: 22, heightCm: 112, bmi: null } },
    { patientIndex: 7, doctorUsername: "dr.mbarga", specialty: "Urgences", roomIndex: 3, priority: "tres_urgent", reason: "Accident de moto, plaie au bras", scheduledAt: daysAgoAt(0, 10), status: "en_cours",
      nurseNotes: "Patient amené par les pompiers, plaie nettoyée et compressée à l'arrivée.", symptoms: "Plaie ouverte à l'avant-bras droit, douleur intense, saignement modéré contrôlé.",
      relevantHistory: ["Aucun antécédent médical connu"], presentIllnessHistory: "Accident de la circulation il y a 30 minutes, chute de moto avec plaie au bras droit.",
      vitals: { ...baseVitals, painScoreEva: 7, heartRate: 105 } },

    { patientIndex: 5, doctorUsername: "dr.mbarga", specialty: "Médecine générale", roomIndex: 0, priority: "normal", reason: "Toux persistante", scheduledAt: daysAgoAt(0, 11), status: "en_attente",
      nurseNotes: "Triage effectué, patient installé en salle d'attente, en attente du médecin.", symptoms: "Toux sèche persistante depuis une semaine, légère gêne respiratoire.",
      relevantHistory: ["Aucun antécédent médical notable"], vitals: { ...baseVitals, temperature: 37.6 } },
    { patientIndex: 15, doctorUsername: "dr.fokou", specialty: "Cardiologie", roomIndex: 2, priority: "normal", reason: "Palpitations", scheduledAt: daysAgoAt(0, 11, 30), status: "en_attente",
      nurseNotes: "Triage effectué, constantes prises, patient en attente de consultation cardiologique.", symptoms: "Palpitations intermittentes depuis 3 jours, sans douleur thoracique.",
      relevantHistory: ["Aucun antécédent cardiaque connu"], vitals: { ...baseVitals, heartRate: 96 } },
    { patientIndex: 13, doctorUsername: "dr.toure", specialty: "Pédiatrie", roomIndex: 5, priority: "urgent", reason: "Douleurs abdominales, vomissements", scheduledAt: daysAgoAt(0, 12), status: "en_attente",
      nurseNotes: "Triage prioritaire, enfant algique, parents présents en salle d'attente.", symptoms: "Douleurs abdominales et vomissements répétés depuis ce matin.",
      relevantHistory: ["Vaccinations à jour"], vitals: { ...baseVitals, temperature: 38.0, weightKg: 31, heightCm: 134, bmi: null } },

    { patientIndex: 6, doctorUsername: "dr.mbarga", specialty: "Médecine générale", roomIndex: 1, priority: "normal", reason: "Certificat médical", scheduledAt: daysFromNowAt(0, 15), status: "planifiee" },
    { patientIndex: 2, doctorUsername: "dr.fokou", specialty: "Cardiologie", roomIndex: 2, priority: "normal", reason: "Bilan cardiovasculaire de routine", scheduledAt: daysFromNowAt(1, 9), status: "planifiee" },
    { patientIndex: 10, doctorUsername: "dr.mbarga", specialty: "Médecine générale", roomIndex: 0, priority: "normal", reason: "Renouvellement d'ordonnance", scheduledAt: daysFromNowAt(1, 10), status: "planifiee" },
    { patientIndex: 12, doctorUsername: "dr.mbarga", specialty: "Médecine générale", roomIndex: 0, priority: "normal", reason: "Consultation de suivi diabète", scheduledAt: daysFromNowAt(2, 9), status: "planifiee" },
    { patientIndex: 14, doctorUsername: "dr.toure", specialty: "Pédiatrie", roomIndex: 5, priority: "normal", reason: "Contrôle croissance", scheduledAt: daysFromNowAt(2, 14), status: "planifiee" },
    { patientIndex: 0, doctorUsername: "dr.fokou", specialty: "Cardiologie", roomIndex: 2, priority: "normal", reason: "Douleurs thoraciques à l'effort", scheduledAt: daysFromNowAt(3, 9), status: "planifiee" },
    { patientIndex: 9, doctorUsername: "dr.toure", specialty: "Pédiatrie", roomIndex: 5, priority: "normal", reason: "Consultation annulée par la famille", scheduledAt: daysAgoAt(1, 16), status: "annulee",
      nurseNotes: "Famille a prévenu l'accueil par téléphone avant l'arrivée du patient : annulation, enfant guéri." },
  ];

  const createdConsultations: Array<{ id: string; patientId: string; doctorId: string }> = [];
  for (const [consultationIndex, spec] of CONSULTATION_SPECS.entries()) {
    const doctor = staff(spec.doctorUsername);
    const p = patient(spec.patientIndex);
    const r = room(spec.roomIndex);
    const id = seedId(300 + consultationIndex);

    const consultationData = {
      patientId: p.id,
      scheduledAt: spec.scheduledAt,
      specialty: spec.specialty,
      assignedDoctorId: doctor.id,
      roomId: r.id,
      priority: spec.priority,
      reason: spec.reason,
      tenantId: tenant.id,
    };
    const existing = await findOrUndefined(() => consultations.findById(id, tenant.id));
    const created = existing
      ? await consultations.update(id, tenant.id, consultationData)
      : await consultations.create({ id, ...consultationData });

    if (spec.status !== "planifiee") {
      const patch: Record<string, unknown> = { status: spec.status };
      if (spec.nurseNotes) patch.nurseNotes = spec.nurseNotes;
      if (spec.symptoms) patch.symptoms = spec.symptoms;
      if (spec.relevantHistory) patch.relevantHistory = spec.relevantHistory;
      if (spec.presentIllnessHistory) patch.presentIllnessHistory = spec.presentIllnessHistory;
      if (spec.vitals) patch.vitals = spec.vitals;
      if (spec.diagnosisPrincipal) {
        patch.diagnosisPrincipal = spec.diagnosisPrincipal;
        patch.diagnosisSecondary = spec.diagnosisSecondary ?? [];
        patch.diagnosisHypothesis = spec.diagnosisHypothesis ?? null;
        const defaultFindings: Record<string, string> = {
          cardiovasculaire: "Bruits du cœur réguliers, pas de souffle",
          respiratoire: "Murmure vésiculaire bilatéral et symétrique",
          neurologique: "Pas de déficit sensitivomoteur",
          digestif: "Abdomen souple, non douloureux",
        };
        if (spec.abnormalSystemFinding) {
          defaultFindings[spec.abnormalSystemFinding.system] = spec.abnormalSystemFinding.notes;
        }
        patch.physicalExam = {
          generalState: "Bon état général",
          consciousness: "Conscient, orienté",
          hydration: "Correctement hydraté",
          systemFindings: Object.entries(defaultFindings).map(([system, notes]) => ({
            system,
            status: spec.abnormalSystemFinding?.system === system ? "anormal" : "normal",
            notes,
          })),
        };
      }
      if (spec.carePlan) patch.carePlan = spec.carePlan;
      await consultations.update(created.id, tenant.id, patch);
    }

    createdConsultations.push({ id: created.id, patientId: p.id, doctorId: doctor.id });

    const accueil = staff("accueil.demo").id;
    const nurse = staff("inf.kone").id;
    const trailByStatus: Record<Status, QueueEventType[]> = {
      planifiee: [],
      en_attente: ["arrived", "registered", "waiting"],
      en_cours: ["arrived", "registered", "waiting", "called", "in_consultation"],
      terminee: ["arrived", "registered", "waiting", "called", "in_consultation", "completed"],
      annulee: ["arrived", "registered", "cancelled"],
    };
    for (const [eventIndex, eventType] of trailByStatus[spec.status].entries()) {
      const actorUserId = eventType === "arrived" || eventType === "registered" ? accueil : nurse;
      const eventId = seedId(5_000 + consultationIndex * 10 + eventIndex);
      const event = await queue.findById(eventId, tenant.id);
      if (!event) {
        await queue.appendEvent({
          id: eventId,
          tenantId: tenant.id,
          consultationId: created.id,
          patientId: p.id,
          eventType,
          actorUserId,
        });
      }
    }
  }
  console.log(`Seeded ${createdConsultations.length} consultations with queue history`);

  // ---- Lab orders ----------------------------------------------------------
  const labo = staff("labo.demo").id;
  const labOrderSpecs = [
    { consultationIndex: 0, exams: ["Numération Formule Sanguine (NFS)", "Goutte épaisse (Paludisme)"], priority: "normal" as const, clinicalContext: "Douleurs abdominales fébriles, bilan infectieux de première intention.", specialInstructions: "Prélèvement à jeun non nécessaire.", status: "termine" as const, results: ["Leucocytose modérée", "Négatif"], followUp: { action: "aucune_action" as const, note: "Résultats cohérents avec une gastro-entérite, pas de suivi biologique nécessaire." } },
    { consultationIndex: 2, exams: ["Glycémie à jeun", "Créatininémie"], priority: "urgent" as const, clinicalContext: "Décompensation diabétique, bilan métabolique en urgence.", specialInstructions: "Résultats à transmettre directement au médecin dès disponibilité.", status: "en_cours" as const },
    { consultationIndex: 3, exams: ["Électrocardiogramme (ECG)", "Bilan lipidique"], priority: "normal" as const, clinicalContext: "Souffle systolique découvert à l'auscultation, bilan cardiovasculaire complémentaire.", specialInstructions: "Patient à jeun depuis 8h pour le bilan lipidique.", status: "a_valider" as const },
    { consultationIndex: 4, exams: ["Scanner cérébral"], priority: "urgent" as const, clinicalContext: "Suspicion d'AVC, imagerie cérébrale en urgence.", specialInstructions: "Prévenir le service d'imagerie avant l'arrivée du patient.", status: "probleme_signale" as const, problemReport: "Patient trop agité pour l'examen, à reprogrammer sous sédation légère." },
    { consultationIndex: 6, exams: ["Test de diagnostic rapide du paludisme"], priority: "normal" as const, clinicalContext: "Fièvre chez l'enfant, dépistage du paludisme.", specialInstructions: "Prélèvement capillaire suffisant.", status: "demande" as const },
    { consultationIndex: 9, exams: ["Radiographie thoracique"], priority: "normal" as const, clinicalContext: "Toux persistante, imagerie demandée avant réévaluation.", specialInstructions: "Examen finalement annulé à la demande du médecin.", status: "annule" as const },
  ];
  let labOrderCount = 0;
  for (const [labOrderIndex, spec] of labOrderSpecs.entries()) {
    const consultation = createdConsultations[spec.consultationIndex];
    const id = seedId(400 + labOrderIndex);
    const data = {
      tenantId: tenant.id,
      consultationId: consultation.id,
      examLines: spec.exams.map((examName) => ({ examName })),
      requestedByUserId: consultation.doctorId,
      priority: spec.priority,
      clinicalContext: spec.clinicalContext,
      specialInstructions: spec.specialInstructions,
    };
    const existing = await findOrUndefined(() => labOrders.findById(id, tenant.id));
    const created = existing
      ? await labOrders.update(id, tenant.id, {
          examLines: data.examLines.map((line) => ({ ...line, resultText: null })),
        }, labo)
      : await labOrders.create({ id, ...data });
    if (spec.status !== "demande") {
      const patch: { status: typeof spec.status; examLines?: { examName: string; resultText: string | null }[]; problemReport?: string } = { status: spec.status };
      if (spec.results) {
        patch.examLines = spec.exams.map((examName, i) => ({ examName, resultText: spec.results![i] ?? null }));
      }
      if (spec.problemReport) patch.problemReport = spec.problemReport;
      await labOrders.update(created.id, tenant.id, patch, labo);
    }
    if (spec.followUp) {
      await labOrders.recordFollowUp(created.id, tenant.id, { followUpAction: spec.followUp.action, followUpNote: spec.followUp.note });
    }
    labOrderCount += 1;
  }
  console.log(`Seeded ${labOrderCount} lab orders`);

  // ---- Prescriptions ---------------------------------------------------------
  const pharma = staff("pharma.demo").id;
  const prescriptionSpecs: Array<{ consultationIndex: number; lines: Omit<PrescriptionLine, "dispenseStatus">[]; dispensed: boolean[]; status?: PrescriptionStatus }> = [
    {
      consultationIndex: 0,
      lines: [
        { drugName: "Paracétamol 500mg", dosage: "1 comprimé", frequency: "3 fois par jour", durationDays: 5, quantity: "15 comprimés" },
        { drugName: "Oméprazole 20mg", dosage: "1 gélule", frequency: "1 fois par jour, le matin", durationDays: 7, quantity: "7 gélules" },
      ],
      dispensed: [true, true],
    },
    {
      consultationIndex: 1,
      lines: [
        { drugName: "Amlodipine 5mg", dosage: "1 comprimé", frequency: "1 fois par jour", durationDays: 30, quantity: "30 comprimés" },
      ],
      dispensed: [true],
    },
    {
      consultationIndex: 2,
      lines: [
        { drugName: "Metformine 500mg", dosage: "1 comprimé", frequency: "2 fois par jour", durationDays: 30, quantity: "60 comprimés" },
        { drugName: "Sérum salé 0,9%", dosage: "500 mL", frequency: "Perfusion unique", durationDays: 1, quantity: "1 poche" },
      ],
      dispensed: [false, true],
    },
    {
      consultationIndex: 6,
      lines: [
        { drugName: "Artéméther/Luméfantrine (Coartem)", dosage: "1 comprimé", frequency: "2 fois par jour", durationDays: 3, quantity: "6 comprimés" },
      ],
      dispensed: [false],
    },
    {
      consultationIndex: 3,
      lines: [{ drugName: "Bisoprolol 2,5mg", dosage: "1 comprimé", frequency: "1 fois par jour", durationDays: 30, quantity: "30 comprimés" }],
      dispensed: [false],
      status: "prepare",
    },
    {
      consultationIndex: 5,
      lines: [{ drugName: "Ibuprofène 400mg", dosage: "1 comprimé", frequency: "si douleur", durationDays: 3, quantity: "6 comprimés" }],
      dispensed: [false],
      status: "annule",
    },
  ];
  let prescriptionCount = 0;
  for (const [prescriptionIndex, spec] of prescriptionSpecs.entries()) {
    const consultation = createdConsultations[spec.consultationIndex];
    const id = seedId(500 + prescriptionIndex);
    const data = {
      tenantId: tenant.id,
      consultationId: consultation.id,
      lines: spec.lines,
      prescribedByUserId: consultation.doctorId,
    };
    const existing = await findOrUndefined(() => prescriptions.findById(id, tenant.id));
    const created = existing
      ? await prescriptions.update(id, tenant.id, {
          lines: data.lines.map((line) => ({ ...line, dispenseStatus: "en_attente" })),
        }, pharma)
      : await prescriptions.create({ id, ...data });
    const anyDispensed = spec.dispensed.some(Boolean);
    if (anyDispensed) {
      const lines: PrescriptionLine[] = created.lines.map((line, i) => ({
        ...line,
        dispenseStatus: spec.dispensed[i] ? "delivre" : "en_attente",
      }));
      await prescriptions.update(created.id, tenant.id, { lines }, pharma);
    } else if (spec.status) {
      await prescriptions.update(created.id, tenant.id, { status: spec.status }, pharma);
    }
    prescriptionCount += 1;
  }
  console.log(`Seeded ${prescriptionCount} prescriptions`);

  // ---- Settings (skip initial-setup wizard) ---------------------------------
  const settingSpecs: Array<{ key: string; value: string; category: string; dataType: string }> = [
    { key: "companyName", value: "Clinique Démo Medical Connect", category: "company", dataType: "string" },
    { key: "companyPhone", value: "+229 21 30 45 67", category: "company", dataType: "string" },
    { key: "companyEmail", value: "contact@clinique-demo.bj", category: "company", dataType: "string" },
    { key: "companyAddress", value: "Avenue Jean-Paul II, Cotonou", category: "company", dataType: "string" },
    { key: "companyWebsite", value: "www.clinique-demo.bj", category: "company", dataType: "string" },
    { key: "defaultCurrency", value: "XOF", category: "system", dataType: "string" },
    { key: "currencyDecimalSeparator", value: ",", category: "system", dataType: "string" },
    { key: "currencyThousandSeparator", value: ".", category: "system", dataType: "string" },
    { key: "currencyDecimalPlaces", value: "2", category: "system", dataType: "number" },
    { key: "currencySymbolPosition", value: "after", category: "system", dataType: "string" },
    { key: "defaultTaxRate", value: "18", category: "system", dataType: "number" },
    { key: "dateFormat", value: "DD/MM/YYYY", category: "system", dataType: "string" },
    { key: "timeFormat", value: "24h", category: "system", dataType: "string" },
    { key: "language", value: "fr", category: "system", dataType: "string" },
    { key: "autoBackup", value: "true", category: "system", dataType: "boolean" },
    { key: "initialSetupCompleted", value: "true", category: "system", dataType: "boolean" },
  ];
  for (const [index, s] of settingSpecs.entries()) {
    const existing = await settings.findByKey(s.key, tenant.id);
    if (existing) {
      await settings.updateByKey(s.key, tenant.id, s);
    } else {
      await settings.create({ id: seedId(600 + index), ...s }, tenant.id);
    }
  }

  // ---- Administrative views ------------------------------------------------
  // These documents are visible to administrators and are intentionally
  // related to already-seeded users and care records. They do not create a
  // tenant encryption key or emulate live synchronization.
  const auditSpecs = [
    { id: seedId(700), action: "CREATE" as const, entityType: "consultations", entityId: createdConsultations[0].id, changes: { patientId: createdConsultations[0].patientId }, status: "SUCCESS" as const },
    { id: seedId(701), action: "UPDATE" as const, entityType: "lab-orders", entityId: seedId(400), changes: { consultationId: createdConsultations[0].id }, status: "SUCCESS" as const },
    { id: seedId(702), action: "PATCH" as const, entityType: "prescriptions", entityId: seedId(500), changes: { consultationId: createdConsultations[0].id }, status: "SUCCESS" as const },
    { id: seedId(703), action: "DELETE" as const, entityType: "patients", entityId: seedId(215), changes: null, status: "FAILED" as const, errorMessage: "Suppression refusée : le patient possède un historique de soins." },
  ];
  for (const spec of auditSpecs) {
    const existing = await audit.find(tenant.id, { entityType: spec.entityType, entityId: spec.entityId, limit: 1 });
    if (existing.length === 0) {
      await audit.create({
        ...spec,
        userId: staff("admin.demo").id,
        tenantId: tenant.id,
        requestBody: null,
        responseBody: null,
        metadata: { source: "demo-seed" },
      });
    }
  }

  const deviceSpecs = [
    { deviceId: "demo-accueil-desktop", status: "approved" as const },
    { deviceId: "demo-medecin-tablette", status: "pending" as const },
    { deviceId: "demo-old-phone", status: "revoked" as const },
  ];
  for (const spec of deviceSpecs) {
    const existing = await devices.findByDevice(tenant.id, spec.deviceId);
    const device = existing ?? await devices.create({
      tenantId: tenant.id,
      deviceId: spec.deviceId,
      devicePublicKey: `demo-public-key-${spec.deviceId}`,
    });
    if (spec.status === "approved" && device.status !== "approved") {
      await devices.approve(tenant.id, spec.deviceId, staff("admin.demo").id);
    }
    if (spec.status === "revoked" && device.status !== "revoked") {
      await devices.revoke(tenant.id, spec.deviceId, staff("admin.demo").id);
    }
  }
  await tenants.markInitialized(tenant.id);
  console.log("Seeded settings and marked tenant as initialized");

  printSummary(tenant.id);
}

function printSummary(tenantId: string) {
  console.log("\nDemo data ready — tenant:", tenantId);
  console.log(`Password for every account below: "${SEED_PASSWORD}"\n`);
  console.log("  admin.demo     — Administrateur");
  console.log("  manager.demo   — Manager");
  console.log("  accueil.demo   — Accueil");
  console.log("  inf.kone       — Infirmière (Urgences)");
  console.log("  dr.mbarga      — Médecin (Médecine générale)");
  console.log("  dr.fokou       — Médecin (Cardiologie)");
  console.log("  dr.toure       — Médecin (Pédiatrie)");
  console.log("  labo.demo      — Laboratoire");
  console.log("  pharma.demo    — Pharmacien");
}

main().catch((error) => {
  console.error("Demo seed failed:", error);
  process.exitCode = 1;
});
