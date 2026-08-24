import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PolicyService } from "../policies/policy.service";
import { POLICY_KEY, PolicyMetadata } from "../decorators/check-policy.decorator";

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private policyService: PolicyService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.get<PolicyMetadata>(
      POLICY_KEY,
      context.getHandler()
    );

    if (!metadata) {
      // No policy specified, allow access
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    const allowed = await this.policyService.checkPolicy(
      metadata.policy,
      metadata.action,
      user
    );

    if (!allowed) {
      throw new ForbiddenException(
        `You do not have permission to ${metadata.action}`
      );
    }

    return true;
  }
}

