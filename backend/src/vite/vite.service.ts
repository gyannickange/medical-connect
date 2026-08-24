import { Injectable, Logger } from "@nestjs/common";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as viteModule from "vite";
import viteConfig from "../../vite.config.js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class ViteService {
  private readonly logger = new Logger(ViteService.name);

  async setupVite(app: FastifyInstance, server: any) {
    this.logger.log("Setting up Vite middleware for development...");

    const vite = await viteModule.createServer({
      ...viteConfig,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { server },
        fs: {
          strict: false,
          allow: [path.resolve(process.cwd(), "..")],
        },
      },
      appType: "custom",
    });

    // Use Vite middleware for non-API routes
    // Vite will handle serving index.html for unknown routes automatically
    (app as any).use((req: any, res: any, next: any) => {
      const url = req.url;

      // Skip API routes - let NestJS handle them
      if (url.startsWith("/api")) {
        return next();
      }

      // Let Vite handle everything else (including serving index.html for HTML requests)
      vite.middlewares(req, res, next);
    });

    // Store vite instance for later use
    this.viteInstance = vite;

    this.logger.log("Vite middleware setup complete");

    return vite;
  }

  private viteInstance: any = null;

  async handleSPARouting(request: FastifyRequest, reply: FastifyReply) {
    const url = request.url;

    // Don't handle API routes
    if (url.startsWith("/api")) {
      reply.code(404).send({ error: "Not Found" });
      return;
    }

    if (!this.viteInstance) {
      reply.code(500).send({ error: "Vite not initialized" });
      return;
    }

    try {
      // Get the project root (parent of server-nest)
      const projectRoot = path.resolve(process.cwd(), "..");
      const clientTemplate = path.join(projectRoot, "frontend", "index.html");

      this.logger.debug(`Loading template from: ${clientTemplate}`);

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${crypto.randomBytes(8).toString("hex")}"`
      );
      const page = await this.viteInstance.transformIndexHtml(url, template);

      reply.type("text/html").send(page);
    } catch (e) {
      this.viteInstance.ssrFixStacktrace(e as Error);
      this.logger.error("Error serving Vite page:", e);
      reply.code(500).send({ error: "Internal Server Error" });
    }
  }

  async setupStaticServing(app: FastifyInstance) {
    this.logger.log("Setting up static file serving for production...");

    // Match Vite build output path (backend/dist/public)
    const distPath = path.resolve(__dirname, "..", "..", "dist", "public");

    if (!fs.existsSync(distPath)) {
      throw new Error(
        `Could not find the build directory: ${distPath}, make sure to build the client first`
      );
    }

    // Register fastify-static with setHeaders to handle SPA routing
    await app.register(require("@fastify/static"), {
      root: distPath,
      prefix: "/",
      setHeaders: (res: any, path: string) => {
        // Serve index.html for HTML requests
        if (path.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    });

    // Set up SPA routing fallback for production
    // Only set if not already set
    try {
      app.setNotFoundHandler(async (request: any, reply: any) => {
        const url = request.url;

        // Don't handle API routes
        if (url.startsWith("/api")) {
          reply.code(404).send({ error: "Not Found" });
          return;
        }

        // Serve index.html for all other routes (SPA routing)
        return (reply as any).sendFile("index.html");
      });
    } catch (err) {
      // Not found handler may already be set by @fastify/static
      this.logger.warn("NotFoundHandler already set, skipping");
    }

    this.logger.log("Static file serving setup complete");
  }
}
