import { ForbiddenException } from "@nestjs/common";
import { StaffService } from "./staff.service";

describe("StaffService role validation", () => {
  function rolesService(overrides: Partial<{ findById: jest.Mock }> = {}) {
    return { findById: jest.fn().mockResolvedValue({ id: "medecin" }), ...overrides };
  }

  function sequenceCounterService(overrides: Partial<{ next: jest.Mock }> = {}) {
    return { next: jest.fn().mockResolvedValue(1), ...overrides };
  }

  describe("create", () => {
    it("accepts a role that exists in the caller's tenant", async () => {
      const usersRepository = { create: jest.fn().mockResolvedValue({ id: "u1", password: "hashed", role: "medecin", tenantId: "t1" }) };
      const service = new StaffService(usersRepository as any, rolesService() as any, sequenceCounterService() as any);

      await service.create({ username: "j.doe", password: "secret123", firstName: "J", lastName: "Doe", role: "medecin", tenantId: "t1" } as any);

      expect(usersRepository.create).toHaveBeenCalled();
    });

    it("rejects a role id that doesn't exist in the caller's tenant", async () => {
      const rolesServiceMock = rolesService({ findById: jest.fn().mockRejectedValue(new Error("not found")) });
      const service = new StaffService({ create: jest.fn() } as any, rolesServiceMock as any, sequenceCounterService() as any);

      await expect(
        service.create({ username: "j.doe", password: "secret123", firstName: "J", lastName: "Doe", role: "not-a-real-role", tenantId: "t1" } as any)
      ).rejects.toThrow(ForbiddenException);
    });

    it("skips role validation when no role is provided (defaults handled elsewhere)", async () => {
      const rolesServiceMock = rolesService();
      const usersRepository = { create: jest.fn().mockResolvedValue({ id: "u1", password: "hashed", tenantId: "t1" }) };
      const service = new StaffService(usersRepository as any, rolesServiceMock as any, sequenceCounterService() as any);

      await service.create({ username: "j.doe", password: "secret123", firstName: "J", lastName: "Doe", tenantId: "t1" } as any);

      expect(rolesServiceMock.findById).not.toHaveBeenCalled();
    });

    it("generates a zero-padded sequential matricule, ignoring any client-supplied value", async () => {
      const usersRepository = { create: jest.fn().mockResolvedValue({ id: "u1", password: "hashed", tenantId: "t1" }) };
      const sequenceCounterServiceMock = sequenceCounterService({ next: jest.fn().mockResolvedValue(7) });
      const service = new StaffService(usersRepository as any, rolesService() as any, sequenceCounterServiceMock as any);

      await service.create({ username: "j.doe", password: "secret123", firstName: "J", lastName: "Doe", tenantId: "t1", matricule: "client-supplied" } as any);

      expect(sequenceCounterServiceMock.next).toHaveBeenCalledWith("t1", "staff");
      expect(usersRepository.create).toHaveBeenCalledWith(expect.objectContaining({ matricule: "00007" }));
    });
  });

  describe("update", () => {
    it("rejects a role id that doesn't exist in the caller's tenant", async () => {
      const rolesServiceMock = rolesService({ findById: jest.fn().mockRejectedValue(new Error("not found")) });
      const service = new StaffService({ update: jest.fn() } as any, rolesServiceMock as any, sequenceCounterService() as any);

      await expect(service.update("u1", "t1", { role: "not-a-real-role" })).rejects.toThrow(ForbiddenException);
    });

    it("accepts an update with no role field at all", async () => {
      const usersRepository = { update: jest.fn().mockResolvedValue({ id: "u1", password: "hashed", tenantId: "t1" }) };
      const service = new StaffService(usersRepository as any, rolesService() as any, sequenceCounterService() as any);

      await service.update("u1", "t1", { firstName: "New name" });

      expect(usersRepository.update).toHaveBeenCalled();
    });

    it("never regenerates or accepts a client-supplied matricule on update", async () => {
      const usersRepository = { update: jest.fn().mockResolvedValue({ id: "u1", password: "hashed", tenantId: "t1" }) };
      const sequenceCounterServiceMock = sequenceCounterService();
      const service = new StaffService(usersRepository as any, rolesService() as any, sequenceCounterServiceMock as any);

      await service.update("u1", "t1", { firstName: "New name", matricule: "client-supplied" } as any);

      expect(sequenceCounterServiceMock.next).not.toHaveBeenCalled();
      expect(usersRepository.update).toHaveBeenCalledWith("u1", "t1", { firstName: "New name" });
    });
  });
});
