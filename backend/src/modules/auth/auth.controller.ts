import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
  Response,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
} from "./dto/password-reset.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { FastifyReply, FastifyRequest } from "fastify";

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto, @Request() req: FastifyRequest) {
    const requester = this.tryDecodeRequester((req as any)?.cookies?.access_token);
    return this.authService.register(
      registerDto.username,
      registerDto.password,
      registerDto.firstName,
      registerDto.lastName,
      registerDto.tenantId,
      registerDto.email,
      registerDto.role,
      requester
    );
  }

  private tryDecodeRequester(token: string | undefined): { userId: string; tenantId: string; role: string } | null {
    if (!token) return null;
    try {
      const payload: any = this.jwtService.verify(token);
      return { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
    } catch {
      return null;
    }
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Response({ passthrough: true }) reply: FastifyReply
  ) {
    const result = await this.authService.login(
      loginDto.username,
      loginDto.password
    );

    // Set httpOnly cookie with JWT token
    (reply as any).cookie("access_token", result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    // Return user and tenant info (without token in body for security)
    return {
      user: result.user,
      tenant: result.tenant,
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Response({ passthrough: true }) reply: FastifyReply) {
    // Clear the cookie
    (reply as any).clearCookie("access_token", {
      path: "/",
    });

    return { message: "Logged out successfully" };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Request() req: FastifyRequest & { user: any }) {
    const user = req.user;
    const tenant = await this.authService.getTenantById(user.tenantId);
    return {
      user,
      tenant,
    };
  }

  @Post("request-password-reset")
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.username);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(
      dto.username,
      dto.oldPassword,
      dto.newPassword
    );
  }
}
