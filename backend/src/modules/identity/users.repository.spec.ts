import { NotFoundException } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

describe("UsersRepository.create", () => {
  function repositoryWithDb() {
    const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, {} as any);
    return { db, repository };
  }

  it("persists service/specialty/matricule/fonction when provided", async () => {
    const { db, repository } = repositoryWithDb();

    const user = await repository.create({
      username: "dr.test",
      password: "hashed",
      firstName: "Test",
      lastName: "Doctor",
      tenantId: "tenant-1",
      role: "medecin",
      service: "Cardiologie",
      specialty: "Cardiologie interventionnelle",
      matricule: "MED-99382",
      fonction: "Médecin Chef Adjoint",
    });

    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "Cardiologie",
        specialty: "Cardiologie interventionnelle",
        matricule: "MED-99382",
        fonction: "Médecin Chef Adjoint",
      })
    );
    expect(user).toMatchObject({
      service: "Cardiologie",
      specialty: "Cardiologie interventionnelle",
      matricule: "MED-99382",
      fonction: "Médecin Chef Adjoint",
    });
  });

  it("defaults service/specialty/matricule/fonction to null when omitted", async () => {
    const { db, repository } = repositoryWithDb();

    await repository.create({
      username: "cashier.test",
      password: "hashed",
      firstName: "Test",
      lastName: "Cashier",
      tenantId: "tenant-1",
    });

    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ service: null, specialty: null, matricule: null, fonction: null })
    );
  });
});

describe("UsersRepository.attachPhoto / getPhotoUrl", () => {
  function existingUser(overrides: Record<string, unknown> = {}) {
    return {
      _id: "user:user-1",
      _rev: "2-a",
      id: "user-1",
      type: "user",
      tenantId: "tenant-1",
      photoS3Key: null,
      ...overrides,
    };
  }

  it("uploads to S3 with a tenant/staff-scoped key and patches photoS3Key", async () => {
    const db = {
      get: jest.fn().mockResolvedValue(existingUser()),
      insert: jest.fn().mockResolvedValue({ ok: true }),
    };
    const s3Service = { uploadObject: jest.fn().mockResolvedValue(undefined) };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, s3Service as any);

    const result = await repository.attachPhoto("user-1", "tenant-1", Buffer.from("img").toString("base64"), "image/jpeg");

    expect(s3Service.uploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^tenants\/tenant-1\/staff\/user-1\/photo-\d+\.jpg$/),
      Buffer.from("img"),
      "image/jpeg"
    );
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ photoS3Key: expect.stringMatching(/^tenants\//) }));
    expect(result.photoS3Key).toMatch(/^tenants\//);
  });

  it("throws NotFoundException when the staff member does not exist", async () => {
    const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, { uploadObject: jest.fn() } as any);

    await expect(repository.attachPhoto("missing", "tenant-1", "aW1n", "image/jpeg")).rejects.toThrow(NotFoundException);
  });

  it("getPhotoUrl returns a presigned URL when photoS3Key is set", async () => {
    const db = { get: jest.fn().mockResolvedValue(existingUser({ photoS3Key: "tenants/tenant-1/staff/user-1/photo-1.jpg" })) };
    const s3Service = { getPresignedUrl: jest.fn().mockResolvedValue("https://signed.example/photo.jpg") };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, s3Service as any);

    const url = await repository.getPhotoUrl("user-1", "tenant-1");

    expect(s3Service.getPresignedUrl).toHaveBeenCalledWith("tenants/tenant-1/staff/user-1/photo-1.jpg", 300);
    expect(url).toBe("https://signed.example/photo.jpg");
  });

  it("getPhotoUrl throws NotFoundException when no photo has been uploaded yet", async () => {
    const db = { get: jest.fn().mockResolvedValue(existingUser()) };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, { getPresignedUrl: jest.fn() } as any);

    await expect(repository.getPhotoUrl("user-1", "tenant-1")).rejects.toThrow(NotFoundException);
  });
});
