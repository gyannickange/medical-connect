import { ProductsPolicy } from "./products.policy";
import type { UserRole } from "./policy.types";

/**
 * Filters out cost fields from data based on user role
 * Only admins can see cost fields
 */
export function filterCostFields<T>(data: T, userRole: UserRole | null): T {
  if (!userRole) {
    return filterCostRecursive(data);
  }

  const policy = new ProductsPolicy(userRole);
  if (policy.canViewCost()) {
    return data;
  }

  return filterCostRecursive(data);
}

/**
 * Recursively removes cost fields from objects and arrays
 */
function filterCostRecursive<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => filterCostRecursive(item)) as T;
  }

  if (typeof obj === "object") {
    const filtered: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "cost") {
        continue; // Skip cost field
      }
      filtered[key] = filterCostRecursive(value);
    }
    return filtered as T;
  }

  return obj;
}

