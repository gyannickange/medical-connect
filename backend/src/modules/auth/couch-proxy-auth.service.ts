import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";

export interface CouchProxyRequestLike {
  method: string;
  url: string;
  cookies?: Record<string, string | undefined>;
}

const ALLOWED_METHODS = new Set(["GET", "HEAD"]);

@Injectable()
export class CouchProxyAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService
  ) {}

  async authorize(request: CouchProxyRequestLike): Promise<void> {
    // Read-only, deliberately: writing through this proxy would bypass every
    // business rule ProductsService enforces. See the "Read-only for this
    // slice" note at the top of this plan.
    if (!ALLOWED_METHODS.has(request.method.toUpperCase())) {
      throw new ForbiddenException(
        "Only read access to CouchDB is allowed through this proxy"
      );
    }

    const token = request.cookies?.access_token;
    if (!token) {
      throw new UnauthorizedException("Missing access token");
    }

    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    const requestedDatabase = this.extractDatabaseName(request.url);
    const isOwnedByCaller = requestedDatabase === `medicalconnect_${user.tenantId}`;
    if (!isOwnedByCaller) {
      throw new ForbiddenException("Tenant does not own this database");
    }
  }

  private extractDatabaseName(url: string): string | null {
    const match = url.match(/^\/api\/couch-proxy\/([^/?]+)/);
    return match ? match[1] : null;
  }
}
