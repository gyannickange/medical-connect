import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { switchMap } from "rxjs/operators";
import { ProductsPolicy } from "../../products/products.policy";
import { PolicyService } from "../policies/policy.service";

@Injectable()
export class RoleDataFilterInterceptor implements NestInterceptor {
  constructor(private readonly policyService: PolicyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      switchMap(async (data) => {
        if (!user) {
          return data;
        }

        // Check if user can view cost using PolicyService (dependency injection)
        const canViewCost = await this.policyService.checkPolicy(
          ProductsPolicy,
          "viewCost",
          user
        );

        if (canViewCost) {
          return data;
        }

        // Remove cost field recursively
        return this.removeCostRecursive(data);
      })
    );
  }

  private removeCostRecursive(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeCostRecursive(item));
    }

    if (typeof obj === "object") {
      const filtered: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === "cost") {
          continue; // Skip cost field
        }
        filtered[key] = this.removeCostRecursive(value);
      }
      return filtered;
    }

    return obj;
  }
}
