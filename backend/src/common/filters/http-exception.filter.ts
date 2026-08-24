import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Get detailed error response
    let errorResponse: any = {
      message: "Internal Server Error",
      statusCode: status,
    };

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      // If it's a validation error with details, include them
      if (typeof exceptionResponse === "object") {
        errorResponse = exceptionResponse;
      } else {
        errorResponse.message = exceptionResponse;
      }
    }

    // Log the error (but don't log full details for validation errors)
    const logMessage =
      exception instanceof HttpException
        ? exception.message
        : "Internal Server Error";

    this.logger.error(
      `${request.method} ${request.url} ${status} - ${logMessage}`,
      exception instanceof Error ? exception.stack : undefined
    );

    response.status(status).send(errorResponse);
  }
}
