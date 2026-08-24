import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PolicyGuard } from "./guards/policy.guard";
import { PolicyService } from "./policies/policy.service";
import { RoleDataFilterInterceptor } from "./interceptors/role-data-filter.interceptor";
import { CouchProxyAuthService } from "./couch-proxy-auth.service";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [
    PassportModule,
    IdentityModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key-change-in-production",
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRATION || "7d") as any,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    PolicyGuard,
    PolicyService,
    RoleDataFilterInterceptor,
    CouchProxyAuthService,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    PolicyGuard,
    PolicyService,
    RoleDataFilterInterceptor,
    CouchProxyAuthService,
  ],
})
export class AuthModule {}
