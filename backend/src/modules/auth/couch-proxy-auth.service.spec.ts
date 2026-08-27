import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { CouchProxyAuthService } from "./couch-proxy-auth.service";

const sanitizedUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  username: "cashier",
  tenantId: "tenant-1",
  role: "cashier",
  isActive: true,
  ...overrides,
});

describe("CouchProxyAuthService", () => {
  it("rejects any method other than GET or HEAD, before even checking auth", async () => {
    const jwtService = { verify: jest.fn() };
    const authService = { validateUser: jest.fn() };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      await expect(
        service.authorize({
          method,
          url: "/api/couch-proxy/medicalconnect_tenant-1/_bulk_docs",
          cookies: { access_token: "good-token" },
        })
      ).rejects.toThrow(ForbiddenException);
    }
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it("rejects a request with no access_token cookie", async () => {
    const jwtService = { verify: jest.fn() };
    const authService = { validateUser: jest.fn() };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-1/_all_docs",
        cookies: {},
      })
    ).rejects.toThrow(UnauthorizedException);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired token", async () => {
    const jwtService = {
      verify: jest.fn().mockImplementation(() => {
        throw new Error("jwt expired");
      }),
    };
    const authService = { validateUser: jest.fn() };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-1/_all_docs",
        cookies: { access_token: "bad-token" },
      })
    ).rejects.toThrow(UnauthorizedException);
    expect(authService.validateUser).not.toHaveBeenCalled();
  });

  it("rejects a valid token for a user that no longer exists or is inactive", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = { validateUser: jest.fn().mockResolvedValue(null) };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-1/_all_docs",
        cookies: { access_token: "good-token" },
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects access to another tenant's database", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-2/_all_docs",
        cookies: { access_token: "good-token" },
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows GET access to the caller's own tenant database", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-1/_all_docs?limit=5",
        cookies: { access_token: "good-token" },
      })
    ).resolves.toBeUndefined();
  });

  it("allows GET access to the caller's own tenant stock database", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-1/_all_docs?limit=5",
        cookies: { access_token: "good-token" },
      })
    ).resolves.toBeUndefined();
  });

  it("rejects access to another tenant's stock database", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-2/_all_docs",
        cookies: { access_token: "good-token" },
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows GET access to the caller's own tenant categories database", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-1/_all_docs?limit=5",
        cookies: { access_token: "good-token" },
      })
    ).resolves.toBeUndefined();
  });

  it("rejects access to another tenant's categories database", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/medicalconnect_tenant-2/_all_docs",
        cookies: { access_token: "good-token" },
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects a database name that doesn't match any known entity prefix", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/settings_tenant-1/_all_docs",
        cookies: { access_token: "good-token" },
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows HEAD access to the caller's own tenant database", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "HEAD",
        url: "/api/couch-proxy/medicalconnect_tenant-1",
        cookies: { access_token: "good-token" },
      })
    ).resolves.toBeUndefined();
  });

  it("rejects a malformed proxy URL with no database segment", async () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: "user-1" }) };
    const authService = {
      validateUser: jest.fn().mockResolvedValue(sanitizedUser({ tenantId: "tenant-1" })),
    };
    const service = new CouchProxyAuthService(jwtService as any, authService as any);

    await expect(
      service.authorize({
        method: "GET",
        url: "/api/couch-proxy/",
        cookies: { access_token: "good-token" },
      })
    ).rejects.toThrow(ForbiddenException);
  });
});
