import { buildSeedRolePermissions } from "./seed-role-permissions";

describe("buildSeedRolePermissions", () => {
  it("admin: every action in every module is true", () => {
    expect(buildSeedRolePermissions("admin")).toEqual({
      patients: { view: true, create: true, update: true },
      consultations: { view: true, create: true, update: true, cancel: true },
      queue: { view: true, appendEvent: true },
      labOrders: { view: true, create: true, update: true, recordFollowUp: true },
      examTypes: { view: true, create: true, update: true, delete: true },
      prescriptions: { view: true, create: true, update: true },
      rooms: { view: true, create: true, update: true },
      staff: { view: true, create: true, update: true, delete: true },
      audit: { view: true },
      settings: { view: true, create: true, update: true, delete: true },
      services: { view: true, create: true, update: true },
      specialties: { view: true, create: true, update: true },
      deviceAuthorization: { list: true, approve: true, revoke: true },
      roles: { view: true, create: true, update: true, delete: true },
    });
  });

  it("manager: matches isAdminOrManager()/isManager() OR-branches, false where only isAdmin() gated", () => {
    expect(buildSeedRolePermissions("manager")).toEqual({
      patients: { view: true, create: true, update: true },
      consultations: { view: true, create: true, update: true, cancel: true },
      queue: { view: true, appendEvent: true },
      labOrders: { view: true, create: true, update: true, recordFollowUp: true },
      examTypes: { view: true, create: true, update: true, delete: true },
      prescriptions: { view: true, create: true, update: true },
      rooms: { view: true, create: true, update: true },
      staff: { view: true, create: false, update: false, delete: false },
      audit: { view: false },
      settings: { view: true, create: false, update: false, delete: false },
      services: { view: true, create: true, update: true },
      specialties: { view: true, create: true, update: true },
      deviceAuthorization: { list: true, approve: false, revoke: false },
      roles: { view: false, create: false, update: false, delete: false },
    });
  });

  it("accueil: matches isAccueil() OR-branches exactly", () => {
    expect(buildSeedRolePermissions("accueil")).toEqual({
      patients: { view: true, create: true, update: true },
      consultations: { view: true, create: true, update: false, cancel: true },
      queue: { view: true, appendEvent: true },
      labOrders: { view: false, create: false, update: false, recordFollowUp: false },
      examTypes: { view: false, create: false, update: false, delete: false },
      prescriptions: { view: false, create: false, update: false },
      rooms: { view: true, create: false, update: false },
      staff: { view: false, create: false, update: false, delete: false },
      audit: { view: false },
      settings: { view: false, create: false, update: false, delete: false },
      services: { view: true, create: false, update: false },
      specialties: { view: true, create: false, update: false },
      deviceAuthorization: { list: false, approve: false, revoke: false },
      roles: { view: false, create: false, update: false, delete: false },
    });
  });

  it("infirmier: matches isInfirmier() OR-branches exactly", () => {
    expect(buildSeedRolePermissions("infirmier")).toEqual({
      patients: { view: true, create: false, update: false },
      consultations: { view: true, create: false, update: true, cancel: false },
      queue: { view: true, appendEvent: true },
      labOrders: { view: true, create: false, update: false, recordFollowUp: false },
      examTypes: { view: true, create: false, update: false, delete: false },
      prescriptions: { view: true, create: false, update: false },
      rooms: { view: true, create: false, update: false },
      staff: { view: false, create: false, update: false, delete: false },
      audit: { view: false },
      settings: { view: false, create: false, update: false, delete: false },
      services: { view: true, create: false, update: false },
      specialties: { view: true, create: false, update: false },
      deviceAuthorization: { list: false, approve: false, revoke: false },
      roles: { view: false, create: false, update: false, delete: false },
    });
  });

  it("medecin: matches isMedecin() OR-branches exactly", () => {
    expect(buildSeedRolePermissions("medecin")).toEqual({
      patients: { view: true, create: false, update: false },
      consultations: { view: true, create: true, update: true, cancel: false },
      queue: { view: true, appendEvent: true },
      labOrders: { view: true, create: true, update: false, recordFollowUp: true },
      examTypes: { view: true, create: false, update: false, delete: false },
      prescriptions: { view: true, create: true, update: false },
      rooms: { view: true, create: false, update: false },
      staff: { view: false, create: false, update: false, delete: false },
      audit: { view: false },
      settings: { view: false, create: false, update: false, delete: false },
      services: { view: true, create: false, update: false },
      specialties: { view: true, create: false, update: false },
      deviceAuthorization: { list: false, approve: false, revoke: false },
      roles: { view: false, create: false, update: false, delete: false },
    });
  });

  it("laboratoire: matches isLaboratoire() OR-branches exactly", () => {
    expect(buildSeedRolePermissions("laboratoire")).toEqual({
      patients: { view: false, create: false, update: false },
      consultations: { view: false, create: false, update: false, cancel: false },
      queue: { view: false, appendEvent: false },
      labOrders: { view: true, create: false, update: true, recordFollowUp: false },
      examTypes: { view: true, create: false, update: false, delete: false },
      prescriptions: { view: false, create: false, update: false },
      rooms: { view: false, create: false, update: false },
      staff: { view: false, create: false, update: false, delete: false },
      audit: { view: false },
      settings: { view: false, create: false, update: false, delete: false },
      services: { view: false, create: false, update: false },
      specialties: { view: false, create: false, update: false },
      deviceAuthorization: { list: false, approve: false, revoke: false },
      roles: { view: false, create: false, update: false, delete: false },
    });
  });

  it("pharmacien: matches isPharmacien() OR-branches exactly", () => {
    expect(buildSeedRolePermissions("pharmacien")).toEqual({
      patients: { view: false, create: false, update: false },
      consultations: { view: false, create: false, update: false, cancel: false },
      queue: { view: false, appendEvent: false },
      labOrders: { view: false, create: false, update: false, recordFollowUp: false },
      examTypes: { view: false, create: false, update: false, delete: false },
      prescriptions: { view: true, create: false, update: true },
      rooms: { view: false, create: false, update: false },
      staff: { view: false, create: false, update: false, delete: false },
      audit: { view: false },
      settings: { view: false, create: false, update: false, delete: false },
      services: { view: false, create: false, update: false },
      specialties: { view: false, create: false, update: false },
      deviceAuthorization: { list: false, approve: false, revoke: false },
      roles: { view: false, create: false, update: false, delete: false },
    });
  });
});
