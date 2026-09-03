import {
  Injectable,
  UnauthorizedException,
  GoneException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { User, Tenant } from "@shared/schema";
import { UsersRepository } from "../identity/users.repository";
import { TenantsRepository } from "../identity/tenants.repository";
import * as bcrypt from "bcrypt";
import { timingSafeEqual } from "crypto";
import { normalizeUsername } from "../../lib/exceptions";

export interface LoginResponse {
  user: Omit<User, "password">;
  tenant: Tenant | null;
  access_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly jwtService: JwtService
  ) {}

  async register(): Promise<never> {
    throw new GoneException(
      "Self-registration is disabled. Contact your platform administrator."
    );
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const user = await this.usersRepository.findByUsername(
      normalizeUsername(username)
    );

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Personnel accounts created before password hashing was fixed may still
    // contain a legacy plaintext password. Accept it once, then upgrade it.
    const hasBcryptPassword = /^\$2[aby]\$\d{2}\$/.test(user.password);
    const passwordBuffer = Buffer.from(password);
    const storedPasswordBuffer = Buffer.from(user.password);
    const isPasswordValid = hasBcryptPassword
      ? await bcrypt.compare(password, user.password)
      : passwordBuffer.length === storedPasswordBuffer.length &&
        timingSafeEqual(passwordBuffer, storedPasswordBuffer);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!hasBcryptPassword) {
      await this.usersRepository.update(user.id, user.tenantId, {
        password: await bcrypt.hash(password, 10),
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }

    const tenant = await this.getTenantById(user.tenantId);
    if (user.tenantId !== null && !tenant) {
      throw new UnauthorizedException("Tenant not found");
    }

    // Generate JWT token
    const payload = {
      sub: user.id,
      username: user.username,
      tenantId: user.tenantId,
      role: user.role,
    };
    const access_token = this.jwtService.sign(payload);

    return {
      user: this.sanitizeUser(user),
      tenant,
      access_token,
    };
  }

  async validateUser(userId: string): Promise<Omit<User, "password"> | null> {
    const user = await this.usersRepository.findById(userId);
    if (!user || !user.isActive) {
      return null;
    }
    return this.sanitizeUser(user);
  }

  async requestPasswordReset(username: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findByUsername(
      normalizeUsername(username)
    );
    if (!user) {
      // Don't reveal if user exists
      return {
        message: "If the username exists, a password reset link has been sent",
      };
    }

    // In a real application, you would:
    // 1. Generate a reset token
    // 2. Store it in the database with expiration
    // 3. Send an email with the reset link

    // For now, just return success message
    return {
      message: "If the username exists, a password reset link has been sent",
    };
  }

  async resetPassword(
    username: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findByUsername(
      normalizeUsername(username)
    );
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await this.usersRepository.update(user.id, user.tenantId, {
      password: hashedPassword,
    });

    return { message: "Password updated successfully" };
  }

  async getTenantById(tenantId: string | null): Promise<Tenant | null> {
    if (tenantId === null) return null;
    const tenant = await this.tenantsRepository.findById(tenantId);
    return tenant ?? null;
  }

  private sanitizeUser(user: User): Omit<User, "password"> {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
