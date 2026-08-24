import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const path = request.url;
    const method = request.method;
    const start = Date.now();

    return next.handle().pipe(
      tap((data) => {
        const response = context.switchToHttp().getResponse();
        const duration = Date.now() - start;
        const statusCode = response.statusCode;

        if (path.startsWith("/api")) {
          let logLine = `${method} ${path} ${statusCode} in ${duration}ms`;

          if (data && typeof data === "object") {
            const preview = JSON.stringify(data);
            if (preview.length > 80) {
              logLine += ` :: ${preview.slice(0, 79)}…`;
            } else {
              logLine += ` :: ${preview}`;
            }
          }

          this.logger.log(logLine);
        }
      })
    );
  }
}
