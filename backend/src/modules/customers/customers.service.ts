import { Injectable } from "@nestjs/common";
import type { PaginationOptions } from "../../lib/pagination";
import type { Customer, InsertCustomer } from "@shared/schema";
import { CustomersRepository } from "./customers.repository";
import { SalesRepository } from "../sales/sales.repository";

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly salesRepository: SalesRepository
  ) {}

  async findByTenant(
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    return this.customersRepository.findByTenant(tenantId, options);
  }

  async search(
    query: string,
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    return this.customersRepository.search(query, tenantId, options);
  }

  async getPurchases(customerId: string, tenantId: string): Promise<any[]> {
    return this.salesRepository.findByCustomer(customerId, tenantId);
  }

  async create(data: InsertCustomer): Promise<Customer> {
    return this.customersRepository.create(data);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertCustomer>
  ): Promise<Customer> {
    return this.customersRepository.update(id, tenantId, data);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.customersRepository.delete(id, tenantId);
  }
}
