import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import type { InsertRole, PermissionModule, Role } from "@shared/schema";
import { RolesRepository } from "./roles.repository";
import { UsersRepository } from "../identity/users.repository";
import { SEEDABLE_ROLES, buildSeedRolePermissions } from "./seed-role-permissions";

export type RoleWithUserCount = Role & { activeUserCount: number };

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly usersRepository: UsersRepository
  ) {}

  async findByTenant(tenantId: string): Promise<RoleWithUserCount[]> {
    const [roles, users] = await Promise.all([
      this.rolesRepository.findByTenant(tenantId),
      this.usersRepository.findByTenant(tenantId),
    ]);
    return roles.map((role) => ({
      ...role,
      activeUserCount: users.filter((u) => u.role === role.id && u.isActive).length,
    }));
  }

  findById(id: string, tenantId: string): Promise<Role> {
    return this.rolesRepository.findById(id, tenantId);
  }

  async findMine(tenantId: string, roleId: string): Promise<Record<PermissionModule, Record<string, boolean>>> {
    const role = await this.rolesRepository.findById(roleId, tenantId);
    return role.permissions;
  }

  create(data: InsertRole): Promise<Role> {
    return this.rolesRepository.create({ ...data, isSystemRole: false });
  }

  update(id: string, tenantId: string, data: Partial<InsertRole>): Promise<Role> {
    return this.rolesRepository.update(id, tenantId, data);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    if (id === "admin") {
      throw new ForbiddenException("The admin role cannot be deleted");
    }
    const users = await this.usersRepository.findByTenant(tenantId);
    if (users.some((u) => u.role === id)) {
      throw new ConflictException("Reassign every user with this role before deleting it");
    }
    await this.rolesRepository.delete(id, tenantId);
  }

  async seedSystemRoles(tenantId: string): Promise<Role[]> {
    return Promise.all(
      SEEDABLE_ROLES.map((role) =>
        this.rolesRepository.create({
          id: role,
          name: role,
          permissions: buildSeedRolePermissions(role),
          tenantId,
          isSystemRole: true,
        })
      )
    );
  }
}
