import { describe, expect, it } from "vitest";
import {
  buildLocalTenant,
  buildLocalUserDoc,
  generateRecoveryCode,
  hashSecret,
  isPouchConflictError,
  localUserDocId,
  normalizeUsername,
  resetPasswordWithRecoveryCode,
  toPublicLocalUser,
  verifySecret,
  WeakLocalPasswordError,
} from "./localAuth";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Alice  ")).toBe("alice");
  });
});

describe("localUserDocId", () => {
  it("prefixes the normalized username", () => {
    expect(localUserDocId("Alice")).toBe("user:alice");
  });
});

describe("hashSecret / verifySecret", () => {
  it("verifies a matching secret", async () => {
    const hash = await hashSecret("correct horse battery staple");
    await expect(
      verifySecret("correct horse battery staple", hash)
    ).resolves.toBe(true);
  });

  it("rejects a wrong secret", async () => {
    const hash = await hashSecret("correct horse battery staple");
    await expect(verifySecret("wrong", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashSecret("same-password");
    const b = await hashSecret("same-password");
    expect(a).not.toBe(b);
  });
});

describe("generateRecoveryCode", () => {
  it("produces a three-group readable code", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("does not repeat across calls", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateRecoveryCode())
    );
    expect(codes.size).toBe(20);
  });
});

describe("isPouchConflictError", () => {
  it("recognizes a PouchDB conflict error shape", () => {
    expect(isPouchConflictError({ name: "conflict" })).toBe(true);
  });

  it("rejects other shapes", () => {
    expect(isPouchConflictError({ name: "not_found" })).toBe(false);
    expect(isPouchConflictError(new Error("boom"))).toBe(false);
    expect(isPouchConflictError(null)).toBe(false);
  });
});

describe("buildLocalUserDoc", () => {
  it("builds a doc and a plaintext recovery code that verifies against its hash", async () => {
    const { doc, recoveryCode } = await buildLocalUserDoc({
      username: "Admin",
      password: "hunter2hunter2",
      role: "admin",
    });

    expect(doc._id).toBe("user:admin");
    expect(doc.username).toBe("admin");
    expect(doc.role).toBe("admin");
    expect(doc.active).toBe(true);
    expect(doc.firstName).toBe("Admin");
    expect(doc.lastName).toBe("");
    await expect(
      verifySecret("hunter2hunter2", doc.passwordHash)
    ).resolves.toBe(true);
    await expect(
      verifySecret(recoveryCode, doc.recoveryCodeHash)
    ).resolves.toBe(true);
  });

  it("rejects a password shorter than the minimum", async () => {
    await expect(
      buildLocalUserDoc({
        username: "shortpw",
        password: "short",
        role: "cashier",
      })
    ).rejects.toThrow(WeakLocalPasswordError);
  });
});

describe("resetPasswordWithRecoveryCode", () => {
  it("returns null for a wrong recovery code (and does not burn it)", async () => {
    const { doc, recoveryCode } = await buildLocalUserDoc({
      username: "cashier1",
      password: "pw123456",
      role: "cashier",
    });

    const result = await resetPasswordWithRecoveryCode({
      doc,
      recoveryCode: "WRONG-CODE-0000",
      newPassword: "newpassword1",
    });

    expect(result).toBeNull();
    // the original code must still verify - a wrong attempt didn't consume it
    await expect(
      verifySecret(recoveryCode, doc.recoveryCodeHash)
    ).resolves.toBe(true);
  });

  it("rotates the password and the recovery code on a correct code", async () => {
    const { doc, recoveryCode } = await buildLocalUserDoc({
      username: "cashier1",
      password: "pw123456",
      role: "cashier",
    });

    const result = await resetPasswordWithRecoveryCode({
      doc,
      recoveryCode,
      newPassword: "newpassword1",
    });

    expect(result).not.toBeNull();
    await expect(
      verifySecret("newpassword1", result!.doc.passwordHash)
    ).resolves.toBe(true);
    expect(result!.recoveryCode).not.toBe(recoveryCode);
    await expect(
      verifySecret(result!.recoveryCode, result!.doc.recoveryCodeHash)
    ).resolves.toBe(true);
    // the old code must no longer verify against the new hash
    await expect(
      verifySecret(recoveryCode, result!.doc.recoveryCodeHash)
    ).resolves.toBe(false);
  });
});

describe("toPublicLocalUser / buildLocalTenant", () => {
  it("maps a local doc onto the shared User shape without leaking secrets", async () => {
    const { doc } = await buildLocalUserDoc({
      username: "manager1",
      password: "pw123456",
      role: "manager",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    });
    const publicUser = toPublicLocalUser(doc);

    expect(publicUser).toEqual({
      id: "user:manager1",
      username: "manager1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      role: "manager",
      tenantId: "local",
      isActive: true,
      createdAt: doc.createdAt,
    });
    expect(publicUser).not.toHaveProperty("password");
    expect(publicUser).not.toHaveProperty("passwordHash");
  });

  it("builds a stable synthetic tenant", () => {
    const tenant = buildLocalTenant("2026-08-15T00:00:00.000Z");
    expect(tenant.id).toBe("local");
    expect(tenant.isActive).toBe(true);
  });
});
