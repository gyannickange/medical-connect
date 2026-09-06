import { ForbiddenException, Injectable } from "@nestjs/common";
import type { PaginationOptions } from "../../lib/pagination";
import type { User, InsertUser } from "@shared/schema";
import { normalizeUsername } from "../../lib/exceptions";
import * as bcrypt from "bcrypt";
import { UsersRepository } from "../identity/users.repository";
import { RolesService } from "../roles/roles.service";
import { SequenceCounterService } from "../../lib/sequence-counter.service";

@Injectable()
export class StaffService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesService: RolesService,
    private readonly sequenceCounterService: SequenceCounterService
  ) {}

  async findByTenant(
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    const staff = await this.usersRepository.findByTenant(tenantId, options);
    return staff.map((user) => this.sanitizeUser(user));
  }

  async create(data: InsertUser): Promise<Omit<User, "password">> {
    if (data.role) {
      await this.assertValidRole(data.role, data.tenantId);
    }
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const matricule = await this.generateMatricule(data.tenantId);
    const user = await this.usersRepository.create({
      ...data,
      username: normalizeUsername(data.username),
      password: hashedPassword,
      matricule,
    });
    return this.sanitizeUser(user);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertUser>
  ): Promise<Omit<User, "password">> {
    if (data.role) {
      await this.assertValidRole(data.role, tenantId);
    }
    const { password, matricule, ...updates } = data;
    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;
    const user = await this.usersRepository.update(id, tenantId, {
      ...updates,
      ...(data.username !== undefined && {
        username: normalizeUsername(data.username),
      }),
      ...(hashedPassword !== undefined && { password: hashedPassword }),
    });
    return this.sanitizeUser(user);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.usersRepository.delete(id, tenantId);
  }

  attachPhoto(id: string, tenantId: string, base64Body: string, contentType: string) {
    return this.usersRepository.attachPhoto(id, tenantId, base64Body, contentType);
  }

  getPhotoUrl(id: string, tenantId: string) {
    return this.usersRepository.getPhotoUrl(id, tenantId);
  }

  private async assertValidRole(role: string, tenantId: string): Promise<void> {
    await this.rolesService.findById(role, tenantId).catch(() => {
      throw new ForbiddenException(`Role "${role}" does not exist for this tenant`);
    });
  }

  private async generateMatricule(tenantId: string): Promise<string> {
    const sequence = await this.sequenceCounterService.next(tenantId, "staff");
    return String(sequence).padStart(5, "0");
  }

  private sanitizeUser(user: User): Omit<User, "password"> {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
