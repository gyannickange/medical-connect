import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ValidationPipe, Logger, HttpException } from "@nestjs/common";
import { AppModule } from "./app.module";
import { ViteService } from "./vite/vite.service";
import { PouchDBService } from "./modules/pouchdb/pouchdb.service";
import { WsAdapter } from "@nestjs/platform-ws";
import expressPouchDB from "express-pouchdb";
import { TokenService } from "./websocket/services/token.service";
import { CouchProxyAuthService } from "./modules/auth/couch-proxy-auth.service";
import { createCouchProxyOptions } from "./modules/auth/couch-proxy-options";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  if (!process.env.COUCHDB_URL) {
    logger.warn("COUCHDB_URL is not configured; using the local CouchDB default.");
  }

  // Create Fastify adapter
  const fastifyAdapter = new FastifyAdapter({
    logger: false,
    trustProxy: true,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
    {
      logger: ["error", "warn", "log"],
    }
  );

  // Configure WebSocket adapter for Fastify
  app.useWebSocketAdapter(new WsAdapter(app));

  // Register @fastify/middie for Express middleware compatibility (needed for PouchDB and Vite)
  // Only register if not already present
  const fastifyInstance = app.getHttpAdapter().getInstance();
  if (!fastifyInstance.hasDecorator("use")) {
    await app.register(require("@fastify/middie"));
  }

  // Register cookie support
  await app.register(require("@fastify/cookie"));

  // Security response headers. CSP is left disabled: this same server also
  // serves the SPA (Vite dev/HMR and the built static bundle), and a default
  // CSP would need real tuning against Vite/Tauri's inline script and eval
  // usage before it's safe to turn on - the other Helmet defaults (nosniff,
  // frameguard, etc.) are safe to enable as-is.
  await app.register(require("@fastify/helmet"), {
    contentSecurityPolicy: false,
  });

  // Global REST rate limiting. LAN peer replication (`/api/pouchdb`), the
  // central CouchDB read proxy (`/api/couch-proxy`), and WebSocket signaling
  // (`/api/ws`) are excluded: they're already authenticated per-request (see
  // the middleware below and CouchProxyAuthService), are expected to be
  // high-frequency by design (continuous replication), and WS already has
  // its own message-level rate limiting - this guards the previously
  // unprotected REST endpoints (auth, products, sales, stock, ...).
  await app.register(require("@fastify/rate-limit"), {
    max: 300,
    timeWindow: "1 minute",
    allowList: (req: any) =>
      req.url.startsWith("/api/pouchdb") ||
      req.url.startsWith("/api/couch-proxy") ||
      req.url.startsWith("/api/ws"),
  });

  // Enable CORS for PouchDB. `origin: "*"` combined with `credentials: true`
  // is invalid per the Fetch/CORS spec - browsers refuse to expose a
  // credentialed response whose Access-Control-Allow-Origin is a literal
  // wildcard. Reflecting the request's own Origin back keeps today's
  // allow-everyone posture (LAN peer origins are not enumerable ahead of
  // time) while producing a spec-valid header combination.
  app.enableCors({
    origin: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
    exposedHeaders: ["ETag", "Content-Length"],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
      errorHttpStatusCode: 400,
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => ({
          field: error.property,
          constraints: error.constraints,
          message: Object.values(error.constraints || {}).join(", "),
        }));
        return new (require("@nestjs/common").BadRequestException)({
          message: "Validation failed",
          errors: messages,
          statusCode: 400,
        });
      },
    })
  );

  // Get the underlying HTTP server for WebSocket
  const httpServer = app.getHttpServer();

  // Set up PouchDB express middleware
  const pouchdbService = app.get(PouchDBService);
  const tokenService = app.get(TokenService);
  const PouchDBApp = expressPouchDB(pouchdbService.getPouchWithPrefix(), {
    mode: "minimumForPouchDB",
  });

  // Use express-pouchdb as middleware (after tenant validation from PouchDB controller/middleware)
  (fastifyInstance as any).use(
    "/api/pouchdb",
    async (req: any, res: any, next: any) => {
      // Add CORS headers for PouchDB
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS, HEAD"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Device-ID, If-None-Match"
      );
      res.setHeader("Access-Control-Expose-Headers", "ETag, Content-Length");

      if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
      } else {
        // express-pouchdb is mounted directly on Fastify and therefore does not
        // pass through Nest controller middleware. Authenticate at this boundary.
        const tenantId = req.url.split("?")[0].split("/").filter(Boolean)[0];
        const deviceId = req.headers["x-device-id"];
        const authorization = req.headers.authorization || "";
        const token = authorization.startsWith("Bearer ")
          ? authorization.slice(7)
          : undefined;
        const authenticated =
          tenantId &&
          deviceId &&
          (await tokenService.authenticateWebSocketUser(
            String(deviceId),
            tenantId,
            token,
            false
          ));
        if (!authenticated) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "unauthorized",
              reason: "Valid same-tenant LAN credentials are required",
            })
          );
          return;
        }
        PouchDBApp(req, res, next);
      }
    }
  );

  // Authenticated, tenant-scoped read proxy in front of the real CouchDB.
  // Only registered when COUCHDB_URL is configured, so environments without
  // CouchDB (most developers, today) boot exactly as before.
  if (process.env.COUCHDB_URL) {
    const couchProxyAuthService = app.get(CouchProxyAuthService);
    await app.register(require("@fastify/http-proxy"), {
      ...createCouchProxyOptions(process.env.COUCHDB_URL),
      prefix: "/api/couch-proxy",
      rewritePrefix: "",
      preHandler: async (request: any, reply: any) => {
        try {
          await couchProxyAuthService.authorize(request);
        } catch (error) {
          // Explicit `return` after `reply.send()`: Fastify stops the request
          // lifecycle once a preHandler sends a reply, but we don't rely on
          // that alone — nothing in this function should be able to run, or
          // be read as possibly running, after an auth failure.
          const status = error instanceof HttpException ? error.getStatus() : 401;
          const message =
            error instanceof HttpException ? error.message : "Unauthorized";
          reply.code(status).send({ error: message });
          return;
        }
      },
    });
    logger.log("🔀 CouchDB read proxy registered at /api/couch-proxy");
  } else {
    logger.warn("COUCHDB_URL not set — /api/couch-proxy is disabled");
  }

  // Set up Vite (development) or static serving (production)
  const viteService = app.get(ViteService);
  const isDevelopment = process.env.NODE_ENV !== "production";

  if (isDevelopment) {
    logger.log("Running in DEVELOPMENT mode with Vite HMR");
    await viteService.setupVite(fastifyInstance as any, httpServer);
    // Vite will handle notFoundHandler internally
  } else {
    logger.log("Running in PRODUCTION mode with static serving");
    await viteService.setupStaticServing(fastifyInstance as any);
    // Static serving will handle notFoundHandler internally
  }

  // Get port from environment
  // Default to 5200 to match frontend proxy/env defaults
  const port = parseInt(process.env.PORT || "5200", 10);

  await app.listen(port, "0.0.0.0");

  logger.log(`🚀 Server is running on http://localhost:${port}`);
  logger.log(
    `🔌 WebSocket signaling available at ws://localhost:${port}/api/ws/signaling`
  );
  logger.log(
    `💾 PouchDB replication available at http://localhost:${port}/api/pouchdb`
  );
}

bootstrap().catch((error) => {
  const logger = new Logger("Bootstrap");
  logger.error("Failed to start server:", error);
  process.exit(1);
});
