import { TenantsRepository } from "./tenants.repository";

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    get: jest.fn(),
    insert: jest.fn().mockResolvedValue({ ok: true }),
    find: jest.fn().mockResolvedValue({ docs: [] }),
    ...overrides,
  };
  const couchDBService = {
    getDatabase: jest.fn().mockResolvedValue(db),
  };
  return {
    db,
    couchDBService,
    repository: new TenantsRepository(couchDBService as any),
  };
}

describe("TenantsRepository bootstrap fields", () => {
  it("creates a tenant with initialized false and a hashed, never-plaintext provisioning secret", async () => {
    const { repository, db } = harness();

    const { tenant, provisioningSecret } = await repository.create({
      name: "Boutique Test",
    } as any);

    expect(tenant).not.toHaveProperty("initialized");
    expect(tenant).not.toHaveProperty("provisioningSecretHash");
    expect(provisioningSecret).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const stored = db.insert.mock.calls[0][0];
    expect(stored.initialized).toBe(false);
    expect(stored.provisioningSecretHash).toBeTruthy();
    expect(stored.provisioningSecretHash).not.toBe(provisioningSecret);
    expect(stored.provisioningSecretUsedAt).toBeNull();
    expect(new Date(stored.provisioningSecretExpiresAt).getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  it("verifies and consumes a matching, unexpired, unused secret exactly once", async () => {
    const { repository, db } = harness();
    const { provisioningSecret } = await repository.create({
      name: "Boutique Test",
    } as any);
    const stored = db.insert.mock.calls[0][0];
    db.get.mockResolvedValue(stored);

    const firstAttempt = await repository.verifyAndConsumeProvisioningSecret(
      stored.id,
      provisioningSecret
    );
    expect(firstAttempt).toBe(true);
    expect(db.insert).toHaveBeenCalledTimes(2); // create + consume
    const consumed = db.insert.mock.calls[1][0];
    expect(consumed.provisioningSecretUsedAt).not.toBeNull();

    db.get.mockResolvedValue(consumed);
    const secondAttempt = await repository.verifyAndConsumeProvisioningSecret(
      stored.id,
      provisioningSecret
    );
    expect(secondAttempt).toBe(false);
  });

  it("rejects a wrong secret without consuming the real one", async () => {
    const { repository, db } = harness();
    await repository.create({ name: "Boutique Test" } as any);
    const stored = db.insert.mock.calls[0][0];
    db.get.mockResolvedValue(stored);

    const result = await repository.verifyAndConsumeProvisioningSecret(
      stored.id,
      "WRONG-CODE-0000"
    );

    expect(result).toBe(false);
    expect(db.insert).toHaveBeenCalledTimes(1); // only the original create
  });

  it("rejects an expired secret", async () => {
    const { repository, db } = harness();
    const { provisioningSecret } = await repository.create({
      name: "Boutique Test",
    } as any);
    const stored = db.insert.mock.calls[0][0];
    stored.provisioningSecretExpiresAt = new Date(Date.now() - 1000).toISOString();
    db.get.mockResolvedValue(stored);

    const result = await repository.verifyAndConsumeProvisioningSecret(
      stored.id,
      provisioningSecret
    );

    expect(result).toBe(false);
  });

  it("reports and updates the initialized flag", async () => {
    const { repository, db } = harness();
    await repository.create({ name: "Boutique Test" } as any);
    const stored = db.insert.mock.calls[0][0];
    db.get.mockResolvedValue(stored);

    expect(await repository.isInitialized(stored.id)).toBe(false);

    await repository.markInitialized(stored.id);
    const updated = db.insert.mock.calls[1][0];
    expect(updated.initialized).toBe(true);

    db.get.mockResolvedValue(updated);
    expect(await repository.isInitialized(stored.id)).toBe(true);
  });
});
