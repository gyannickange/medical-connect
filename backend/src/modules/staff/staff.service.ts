import { Injectable } from "@nestjs/common";
import type { PaginationOptions } from "../../lib/pagination";
import type { User, InsertUser } from "@shared/schema";
import { normalizeUsername } from "../../lib/exceptions";
import * as bcrypt from "bcrypt";
import { UsersRepository } from "../identity/users.repository";

@Injectable()
export class StaffService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findByTenant(
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    const staff = await this.usersRepository.findByTenant(tenantId, options);
    return staff.map((user) => this.sanitizeUser(user));
  }

  async create(data: InsertUser): Promise<Omit<User, "password">> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.usersRepository.create({
      ...data,
      username: normalizeUsername(data.username),
      password: hashedPassword,
    });
    return this.sanitizeUser(user);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertUser>
  ): Promise<Omit<User, "password">> {
    const { password, ...updates } = data;
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

  private sanitizeUser(user: User): Omit<User, "password"> {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
