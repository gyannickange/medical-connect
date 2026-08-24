# NestJS Migration - Senior Architecture Plan

## Architectural Principles

### 1. Separation of Concerns

- **Controllers**: Handle HTTP requests/responses, validation, error formatting
- **Services**: Contain business logic, orchestrate operations
- **Repositories/Storage**: Data access layer (already exists as DatabaseStorage)
- **DTOs**: Data Transfer Objects for validation and type safety
- **Interfaces**: Define contracts between layers

### 2. Dependency Injection

- All services injectable via constructor injection
- Singleton services for stateful resources (database, PouchDB instances)
- Scoped services where needed (request-specific context)

## Detailed Module Architecture

### Core Modules

#### 1. DatabaseModule (Foundation Layer)

```
database/
├── database.module.ts          # Exports database and storage services
├── database.service.ts         # Wraps Drizzle connection from db.ts
└── storage.service.ts          # Injectable wrapper around DatabaseStorage
```

**Purpose**: Centralized database access, injected into all other services

**Services**:

- `DatabaseService`: Provides Drizzle connection
- `StorageService`: All CRUD operations (implements IStorage interface)

---

#### 2. AuthModule

```
modules/auth/
├── auth.module.ts
├── auth.controller.ts          # POST /api/auth/login
├── auth.service.ts             # Login logic, token generation (if needed)
└── dto/
    └── login.dto.ts            # { username, password }
```

**Service Layer**:

```typescript
@Injectable()
export class AuthService {
  constructor(private storageService: StorageService) {}

  async login(username: string, password: string): Promise<LoginResponse> {
    // Business logic: validate user, check password, get tenant
    const user = await this.storageService.getUserByUsername(username);
    if (!user || user.password !== password) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const tenant = await this.storageService.getTenant(user.tenantId);
    return { user: this.sanitizeUser(user), tenant };
  }

  private sanitizeUser(user: User) {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
```

---

#### 3. TenantsModule

```
modules/tenants/
├── tenants.module.ts
├── tenants.controller.ts       # GET /api/tenants, POST /api/tenants
├── tenants.service.ts          # Business logic
└── dto/
    └── create-tenant.dto.ts
```

**Service Layer**:

```typescript
@Injectable()
export class TenantsService {
  constructor(private storageService: StorageService) {}

  async findAll(): Promise<Tenant[]> {
    return this.storageService.getAllTenants();
  }

  async create(data: InsertTenant): Promise<Tenant> {
    // Business logic: validate, create tenant, initialize defaults
    return this.storageService.createTenant(data);
  }
}
```

---

#### 4. CategoriesModule

```
modules/categories/
├── categories.module.ts
├── categories.controller.ts
├── categories.service.ts
└── dto/
    ├── create-category.dto.ts
    └── update-category.dto.ts
```

**Service Layer**:

```typescript
@Injectable()
export class CategoriesService {
  constructor(private storageService: StorageService) {}

  async findByTenant(tenantId: string): Promise<Category[]> {
    return this.storageService.getCategoriesByTenant(tenantId);
  }

  async create(data: InsertCategory): Promise<Category> {
    // Business logic: validate category name uniqueness, etc.
    return this.storageService.createCategory(data);
  }

  async update(id: string, data: Partial<InsertCategory>): Promise<Category> {
    const category = await this.storageService.updateCategory(id, data);
    if (!category) {
      throw new NotFoundException("Category not found");
    }
    return category;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.storageService.deleteCategory(id);
    if (!deleted) {
      throw new NotFoundException("Category not found");
    }
  }
}
```

---

#### 5. ProductsModule

```
modules/products/
├── products.module.ts
├── products.controller.ts
├── products.service.ts
└── dto/
    ├── create-product.dto.ts
    └── update-product.dto.ts
```

**Service Layer**:

```typescript
@Injectable()
export class ProductsService {
  constructor(private storageService: StorageService) {}

  async findByTenant(tenantId: string): Promise<Product[]> {
    return this.storageService.getProductsByTenant(tenantId);
  }

  async search(query: string, tenantId: string): Promise<Product[]> {
    return this.storageService.searchProducts(query, tenantId);
  }

  async findByBarcode(barcode: string, tenantId: string): Promise<Product> {
    const product = await this.storageService.getProductByBarcode(
      barcode,
      tenantId
    );
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    return product;
  }

  async create(data: InsertProduct): Promise<Product> {
    // Creates product + initial stock entry (already in storage)
    return this.storageService.createProduct(data);
  }

  async update(id: string, data: Partial<InsertProduct>): Promise<Product> {
    const product = await this.storageService.updateProduct(id, data);
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    return product;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.storageService.deleteProduct(id);
    if (!deleted) {
      throw new NotFoundException("Product not found");
    }
  }
}
```

---

#### 6. StockModule

```
modules/stock/
├── stock.module.ts
├── stock.controller.ts
├── stock.service.ts            # Complex business logic for stock management
└── dto/
    ├── stock-entry.dto.ts
    └── stock-exit.dto.ts
```

**Service Layer**:

```typescript
@Injectable()
export class StockService {
  constructor(private storageService: StorageService, private logger: Logger) {}

  async findByTenant(
    tenantId: string
  ): Promise<(Stock & { product: Product })[]> {
    return this.storageService.getStockByTenant(tenantId);
  }

  async findLowStock(
    tenantId: string
  ): Promise<(Stock & { product: Product })[]> {
    return this.storageService.getLowStockItems(tenantId);
  }

  async stockEntry(
    productId: string,
    quantity: number,
    reason: string,
    userId: string,
    tenantId: string
  ): Promise<Stock> {
    this.logger.log(
      `Stock entry: productId=${productId}, quantity=${quantity}`
    );

    const stock = await this.storageService.getStock(productId);
    if (!stock) {
      throw new NotFoundException("Stock not found");
    }

    const newQuantity = stock.quantity + quantity;
    const updatedStock = await this.storageService.updateStock(
      productId,
      newQuantity
    );

    // Create movement record
    await this.storageService.createStockMovement({
      productId,
      type: "entry",
      quantity,
      previousQuantity: stock.quantity,
      newQuantity,
      reason,
      userId,
      tenantId,
    });

    this.logger.log(`Stock entry successful: ${productId} -> ${newQuantity}`);
    return updatedStock;
  }

  async stockExit(
    productId: string,
    quantity: number,
    reason: string,
    userId: string,
    tenantId: string
  ): Promise<Stock> {
    const stock = await this.storageService.getStock(productId);
    if (!stock) {
      throw new NotFoundException("Stock not found");
    }

    if (stock.quantity < quantity) {
      throw new BadRequestException("Insufficient stock quantity");
    }

    const newQuantity = stock.quantity - quantity;
    const updatedStock = await this.storageService.updateStock(
      productId,
      newQuantity
    );

    // Create movement record
    await this.storageService.createStockMovement({
      productId,
      type: "exit",
      quantity,
      previousQuantity: stock.quantity,
      newQuantity,
      reason,
      userId,
      tenantId,
    });

    return updatedStock;
  }
}
```

---

#### 7. CustomersModule

```
modules/customers/
├── customers.module.ts
├── customers.controller.ts
├── customers.service.ts
└── dto/
    ├── create-customer.dto.ts
    └── update-customer.dto.ts
```

**Service Layer**: Similar pattern to products/categories

---

#### 8. SalesModule

```
modules/sales/
├── sales.module.ts
├── sales.controller.ts
├── sales.service.ts            # Complex transaction logic
└── dto/
    └── create-sale.dto.ts
```

**Service Layer**:

```typescript
@Injectable()
export class SalesService {
  constructor(private storageService: StorageService) {}

  async findByTenant(tenantId: string): Promise<Sale[]> {
    return this.storageService.getSalesByTenant(tenantId);
  }

  async getTodaysSales(tenantId: string) {
    const sales = await this.storageService.getTodaysSales(tenantId);
    const totalSales = sales.reduce(
      (sum, sale) => sum + parseFloat(sale.total),
      0
    );

    return {
      sales,
      count: sales.length,
      total: totalSales.toFixed(2),
    };
  }

  async create(saleData: InsertSale, items: InsertSaleItem[]): Promise<Sale> {
    // Transactional logic already in storage.createSale
    // Service can add validation, notifications, etc.
    return this.storageService.createSale(saleData, items);
  }
}
```

---

#### 9. StaffModule

```
modules/staff/
├── staff.module.ts
├── staff.controller.ts
├── staff.service.ts
└── dto/
    ├── create-staff.dto.ts
    └── update-staff.dto.ts
```

**Service Layer**: Handle user CRUD with password sanitization

---

#### 10. DashboardModule

```
modules/dashboard/
├── dashboard.module.ts
├── dashboard.controller.ts
└── dashboard.service.ts        # Aggregates data from multiple services
```

**Service Layer**:

```typescript
@Injectable()
export class DashboardService {
  constructor(
    private productsService: ProductsService,
    private stockService: StockService,
    private salesService: SalesService,
    private syncService: SyncService
  ) {}

  async getMetrics(tenantId: string) {
    // Orchestrates multiple service calls
    const [products, lowStock, todaysSales, syncStatuses] = await Promise.all([
      this.productsService.findByTenant(tenantId),
      this.stockService.findLowStock(tenantId),
      this.salesService.getTodaysSales(tenantId),
      this.syncService.getAllStatuses(tenantId),
    ]);

    const activeCashiers = syncStatuses.filter(
      (s) => s.status === "online"
    ).length;

    return {
      totalProducts: products.length,
      lowStockItems: lowStock.length,
      todaysSales: todaysSales.total,
      activeCashiers,
      recentSales: todaysSales.sales.slice(-5).reverse(),
      lowStockAlerts: lowStock.slice(0, 10),
    };
  }
}
```

---

#### 11. SyncModule

```
modules/sync/
├── sync.module.ts
├── sync.controller.ts
├── sync.service.ts
└── dto/
    └── update-sync-status.dto.ts
```

**Service Layer**: Manage device sync status

---

#### 12. PeersModule

```
modules/peers/
├── peers.module.ts
├── peers.controller.ts
└── peers.service.ts            # Uses SyncService
```

**Service Layer**:

```typescript
@Injectable()
export class PeersService {
  constructor(private syncService: SyncService) {}

  async getOnlinePeers(tenantId: string) {
    const syncStatuses = await this.syncService.getAllStatuses(tenantId);

    return syncStatuses
      .filter((status) => status.status === "online")
      .map((status) => ({
        deviceId: status.deviceId,
        tenantId: status.tenantId,
        lastSync: status.lastSync,
        pendingChanges: status.pendingChanges,
      }));
  }
}
```

---

#### 13. PouchDBModule (Special Case)

```
modules/pouchdb/
├── pouchdb.module.ts
├── pouchdb.controller.ts       # Minimal - mostly middleware
├── pouchdb.service.ts          # Manages PouchDB instances
└── middleware/
    └── tenant-validation.middleware.ts
```

**Service Layer**:

```typescript
@Injectable()
export class PouchDBService {
  private tenantDatabases = new Map<string, any>();
  private PouchWithPrefix: any;

  constructor(private storageService: StorageService) {
    const PouchDB = require("pouchdb-node");
    this.PouchWithPrefix = PouchDB.defaults({ prefix: "./data/pouchdb/" });
  }

  async getTenantDatabase(tenantId: string) {
    if (this.tenantDatabases.has(tenantId)) {
      return this.tenantDatabases.get(tenantId);
    }

    // Verify tenant exists
    const tenant = await this.storageService.getTenant(tenantId);
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const db = new this.PouchWithPrefix(tenantId);
    await db.info(); // Initialize

    this.tenantDatabases.set(tenantId, db);
    return db;
  }

  getPouchWithPrefix() {
    return this.PouchWithPrefix;
  }
}
```

---

### WebSocket Module (Complex)

```
websocket/
├── websocket.module.ts
├── signaling.gateway.ts        # WebSocket event handlers
├── services/
│   ├── signaling.service.ts    # Business logic
│   ├── security.service.ts     # Rate limiting, IP blocking, auth
│   └── token.service.ts        # HMAC token generation/validation
└── interfaces/
    └── peer-info.interface.ts
```

#### Security Service (Stateful)

```typescript
@Injectable()
export class SecurityService {
  private blockedIps = new Map<string, number>();
  private connectionAttempts = new Map<
    string,
    { count: number; firstAttempt: number }
  >();
  private messageRateLimits = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private preAuthMessageLimits = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private authFailures = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private tenantConnections = new Map<string, number>();
  private ipConnections = new Map<string, number>();

  private readonly config = {
    MAX_CONNECTIONS_PER_TENANT: 50,
    MAX_CONNECTIONS_PER_IP: 5,
    CONNECTION_RATE_LIMIT: 10,
    CONNECTION_RATE_WINDOW: 60 * 1000,
    MESSAGE_RATE_LIMIT: 100,
    MESSAGE_RATE_WINDOW: 60 * 1000,
    AUTH_FAILURE_THRESHOLD: 5,
    IP_BLOCK_DURATION: 15 * 60 * 1000,
  };

  onModuleInit() {
    // Start cleanup interval
    this.startCleanupInterval();
  }

  isIpBlocked(ip: string): boolean {
    /* ... */
  }
  blockIp(ip: string, reason: string): void {
    /* ... */
  }
  checkConnectionRateLimit(ip: string): boolean {
    /* ... */
  }
  checkMessageRateLimit(peerId: string): boolean {
    /* ... */
  }
  checkPreAuthMessageRateLimit(ip: string): boolean {
    /* ... */
  }
  trackAuthFailure(ip: string): boolean {
    /* ... */
  }
  canAddConnection(
    tenantId: string,
    ip: string
  ): { allowed: boolean; reason?: string } {
    /* ... */
  }
  addConnection(tenantId: string, ip: string): void {
    /* ... */
  }
  removeConnection(tenantId: string, ip: string): void {
    /* ... */
  }
  cleanupConnectionData(peerId: string, ip: string, tenantId?: string): void {
    /* ... */
  }

  private startCleanupInterval() {
    /* ... */
  }
}
```

#### Token Service

```typescript
@Injectable()
export class TokenService {
  private usedNonces = new Map<string, { nonce: string; exp: number }>();

  constructor(private storageService: StorageService) {}

  async generateSecureToken(
    tenantId: string,
    deviceId: string
  ): Promise<string> {
    // HMAC token generation logic
  }

  async authenticateWebSocketUser(
    peerId: string,
    tenantId: string,
    authToken?: string
  ): Promise<boolean> {
    // Token validation, nonce checking, etc.
  }
}
```

#### Signaling Service

```typescript
@Injectable()
export class SignalingService {
  private connectedPeers = new Map<string, any>();

  constructor(
    private securityService: SecurityService,
    private tokenService: TokenService,
    private storageService: StorageService
  ) {}

  registerPeer(peerId: string, tenantId: string, ws: any, ip: string) {
    /* ... */
  }
  relaySignal(fromPeer: string, toPeer: string, signal: any, tenantId: string) {
    /* ... */
  }
  broadcastToTenant(tenantId: string, message: any, excludePeer?: string) {
    /* ... */
  }
  getExistingPeers(tenantId: string, excludePeer?: string) {
    /* ... */
  }
  removePeer(peerId: string) {
    /* ... */
  }
}
```

#### Signaling Gateway

```typescript
@WebSocketGateway({ path: "/api/ws/signaling" })
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private signalingService: SignalingService,
    private securityService: SecurityService,
    private tokenService: TokenService
  ) {}

  handleConnection(client: any, ...args: any[]) {
    const clientIp = this.extractClientIp(client);
    // Security checks, auth timeout, etc.
  }

  @SubscribeMessage("register")
  async handleRegister(client: any, payload: any) {
    // Use services for logic
  }

  @SubscribeMessage("webrtc-signal")
  async handleWebRTCSignal(client: any, payload: any) {
    // Use services for logic
  }

  @SubscribeMessage("ping")
  async handlePing(client: any, payload: any) {
    // Use services for logic
  }

  handleDisconnect(client: any) {
    // Cleanup using services
  }
}
```

---

### Vite Module

```
vite/
├── vite.module.ts
└── vite.service.ts
```

**Service Layer**:

```typescript
@Injectable()
export class ViteService {
  async setupVite(app: FastifyInstance, server: any) {
    // Vite middleware integration
  }

  setupStaticServing(app: FastifyInstance) {
    // Production static file serving
  }
}
```

---

### Common Utilities

```
common/
├── interceptors/
│   └── logging.interceptor.ts
├── filters/
│   └── http-exception.filter.ts
├── guards/
│   └── tenant.guard.ts (if needed)
└── decorators/
    └── tenant-id.decorator.ts (if needed)
```

---

## Module Dependency Graph

```
AppModule
├── DatabaseModule (foundation - no dependencies)
├── AuthModule (depends on: DatabaseModule)
├── TenantsModule (depends on: DatabaseModule)
├── CategoriesModule (depends on: DatabaseModule)
├── ProductsModule (depends on: DatabaseModule)
├── StockModule (depends on: DatabaseModule)
├── CustomersModule (depends on: DatabaseModule)
├── SalesModule (depends on: DatabaseModule)
├── StaffModule (depends on: DatabaseModule)
├── SyncModule (depends on: DatabaseModule)
├── PeersModule (depends on: SyncModule)
├── DashboardModule (depends on: Products, Stock, Sales, Sync)
├── PouchDBModule (depends on: DatabaseModule)
├── WebSocketModule (depends on: DatabaseModule, SyncModule)
└── ViteModule (no dependencies)
```

---

## Key Benefits of This Architecture

1. **Testability**: Each service can be unit tested with mocked dependencies
2. **Maintainability**: Business logic in services, HTTP handling in controllers
3. **Reusability**: Services can be injected into multiple controllers
4. **Single Responsibility**: Each class has one clear purpose
5. **Dependency Injection**: Easy to swap implementations, add logging, etc.
6. **Type Safety**: Full TypeScript support throughout
7. **Scalability**: Easy to add new features without touching existing code

---

## Implementation Order

1. **Foundation**: DatabaseModule, StorageService
2. **Simple CRUD**: Auth, Tenants, Categories (establish patterns)
3. **Complex CRUD**: Products, Stock, Customers, Sales, Staff
4. **Aggregation**: Dashboard, Peers, Sync
5. **Special Cases**: PouchDB (middleware integration)
6. **Real-time**: WebSocket module (most complex)
7. **Dev Experience**: Vite module
8. **Cross-cutting**: Logging, error handling
9. **Main App**: Wire everything together in main.ts

---

## Code Quality Standards

- All services use `@Injectable()`
- All controllers use proper decorators (`@Controller`, `@Get`, `@Post`, etc.)
- DTOs for all request bodies
- Proper error handling (NotFoundException, BadRequestException, etc.)
- Logging at service layer for important operations
- No business logic in controllers
- No HTTP concerns in services
- Consistent naming conventions
