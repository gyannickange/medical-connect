import { NotFoundException } from "@nestjs/common";
import { PatientsRepository } from "./patients.repository";

describe("PatientsRepository", () => {
  describe("create", () => {
    it("allocates a dossier number, computes searchName, and creates the patient", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const sequenceCounterService = { next: jest.fn().mockResolvedValue(98) };
      const repository = new PatientsRepository(couchDBService as any, sequenceCounterService as any, { uploadObject: jest.fn(), getPresignedUrl: jest.fn() } as any);

      const result = await repository.create({
        id: "123e4567-e89b-42d3-a456-426614174000",
        lastName: "Diallo",
        firstName: "Aïssatou",
        dateOfBirth: "1994-03-12",
        sex: "F",
        primaryPhone: "+237677889900",
        residenceAddress: "Bastos, Yaoundé",
        tenantId: "tenant-1",
      } as any);

      expect(sequenceCounterService.next).toHaveBeenCalledWith("tenant-1", expect.stringMatching(/^patient:\d{4}$/));
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "patient:123e4567-e89b-42d3-a456-426614174000",
          type: "patient",
          tenantId: "tenant-1",
          searchName: "aïssatou diallo",
          dossierNumber: expect.stringMatching(/^MC-\d{4}-0098$/),
          status: "actif",
          allergyKnowledge: "non_renseigne",
          patientType: "externe",
        })
      );
      expect(result.dossierNumber).toMatch(/^MC-\d{4}-0098$/);
    });
  });

  describe("update", () => {
    function existingPatient(overrides: Record<string, unknown> = {}) {
      return {
        _id: "patient:patient-1",
        _rev: "2-a",
        id: "patient-1",
        type: "patient",
        lastName: "Diallo",
        firstName: "Aïssatou",
        searchName: "aïssatou diallo",
        dossierNumber: "MC-2026-0098",
        tenantId: "tenant-1",
        status: "actif",
        isActive: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        ...overrides,
      };
    }

    it("recomputes searchName when the name changes", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(existingPatient()),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new PatientsRepository(couchDBService as any, { next: jest.fn() } as any, { uploadObject: jest.fn(), getPresignedUrl: jest.fn() } as any);

      const result = await repository.update("patient-1", "tenant-1", { firstName: "Aissatou" });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: "Aissatou", searchName: "aissatou diallo" })
      );
      expect(result.firstName).toBe("Aissatou");
    });

    it("throws NotFoundException when the patient does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new PatientsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        { uploadObject: jest.fn(), getPresignedUrl: jest.fn() } as any
      );

      await expect(repository.update("missing", "tenant-1", { firstName: "X" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("search", () => {
    it("queries by searchName, dossierNumber, and phone with an escaped regex", async () => {
      const docs = [{ _id: "patient:patient-1", type: "patient", firstName: "Aïssatou" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const repository = new PatientsRepository(couchDBService as any, { next: jest.fn() } as any, { uploadObject: jest.fn(), getPresignedUrl: jest.fn() } as any);

      const result = await repository.search("Diallo", "tenant-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({
            type: "patient",
            tenantId: "tenant-1",
          }),
        })
      );
      const call = db.find.mock.calls[0][0];
      expect(call.selector.$or).toHaveLength(3);
      expect(call.selector.$or[0]).toEqual({ searchName: { $regex: "diallo" } });
      expect(result).toEqual([{ _id: "patient:patient-1", type: "patient", firstName: "Aïssatou", id: "patient-1" }]);
    });
  });

  describe("attachPhoto", () => {
    it("uploads to S3 with a tenant/patient-scoped key and patches photoS3Key", async () => {
      const existing = {
        _id: "patient:patient-1",
        _rev: "2-a",
        id: "patient-1",
        type: "patient",
        tenantId: "tenant-1",
        photoS3Key: null,
      };
      const db = {
        get: jest.fn().mockResolvedValue(existing),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const s3Service = { uploadObject: jest.fn().mockResolvedValue(undefined) };
      const repository = new PatientsRepository(couchDBService as any, { next: jest.fn() } as any, s3Service as any);

      const result = await repository.attachPhoto("patient-1", "tenant-1", Buffer.from("img").toString("base64"), "image/jpeg");

      expect(s3Service.uploadObject).toHaveBeenCalledWith(
        expect.stringMatching(/^tenants\/tenant-1\/patients\/patient-1\/photo-\d+\.jpg$/),
        Buffer.from("img"),
        "image/jpeg"
      );
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ photoS3Key: expect.stringMatching(/^tenants\//) }));
      expect(result.photoS3Key).toMatch(/^tenants\//);
    });

    it("throws NotFoundException when the patient does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new PatientsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        { uploadObject: jest.fn() } as any
      );

      await expect(
        repository.attachPhoto("missing", "tenant-1", "aW1n", "image/jpeg")
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getPhotoUrl", () => {
    it("returns a presigned URL when photoS3Key is set", async () => {
      const db = { get: jest.fn().mockResolvedValue({ type: "patient", tenantId: "tenant-1", photoS3Key: "tenants/tenant-1/patients/patient-1/photo-1.jpg" }) };
      const s3Service = { getPresignedUrl: jest.fn().mockResolvedValue("https://signed.example/photo.jpg") };
      const repository = new PatientsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        s3Service as any
      );

      const url = await repository.getPhotoUrl("patient-1", "tenant-1");

      expect(s3Service.getPresignedUrl).toHaveBeenCalledWith("tenants/tenant-1/patients/patient-1/photo-1.jpg", 300);
      expect(url).toBe("https://signed.example/photo.jpg");
    });

    it("throws NotFoundException when no photo has been uploaded yet", async () => {
      const db = { get: jest.fn().mockResolvedValue({ type: "patient", tenantId: "tenant-1", photoS3Key: null }) };
      const repository = new PatientsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        { getPresignedUrl: jest.fn() } as any
      );

      await expect(repository.getPhotoUrl("patient-1", "tenant-1")).rejects.toThrow(NotFoundException);
    });
  });
});
