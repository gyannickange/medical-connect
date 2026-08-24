import { CouchDBService } from "./couchdb.service";

jest.mock("nano");
import Nano from "nano";

describe("CouchDBService", () => {
  const originalUrl = process.env.COUCHDB_URL;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.COUCHDB_URL;
    } else {
      process.env.COUCHDB_URL = originalUrl;
    }
    jest.clearAllMocks();
  });

  it("throws a clear error when COUCHDB_URL is not set", async () => {
    delete process.env.COUCHDB_URL;
    const service = new CouchDBService();

    await expect(service.getDatabase("products_tenant-1")).rejects.toThrow(
      "COUCHDB_URL is required to use CouchDBService"
    );
  });

  it("creates the database when it does not exist yet", async () => {
    process.env.COUCHDB_URL = "http://user:pass@localhost:5984";
    const dbHandle = { name: "products_tenant-1" };
    const client = {
      db: {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        create: jest.fn().mockResolvedValue({ ok: true }),
      },
      use: jest.fn().mockReturnValue(dbHandle),
    };
    (Nano as unknown as jest.Mock).mockReturnValue(client);
    const service = new CouchDBService();

    const db = await service.getDatabase("products_tenant-1");

    expect(client.db.create).toHaveBeenCalledWith("products_tenant-1");
    expect(client.use).toHaveBeenCalledWith("products_tenant-1");
    expect(db).toBe(dbHandle);
  });

  it("reuses the database without creating it when it already exists", async () => {
    process.env.COUCHDB_URL = "http://user:pass@localhost:5984";
    const dbHandle = { name: "products_tenant-1" };
    const client = {
      db: {
        get: jest.fn().mockResolvedValue({ db_name: "products_tenant-1" }),
        create: jest.fn(),
      },
      use: jest.fn().mockReturnValue(dbHandle),
    };
    (Nano as unknown as jest.Mock).mockReturnValue(client);
    const service = new CouchDBService();

    const db = await service.getDatabase("products_tenant-1");

    expect(client.db.create).not.toHaveBeenCalled();
    expect(db).toBe(dbHandle);
  });

  it("caches the database handle across calls", async () => {
    process.env.COUCHDB_URL = "http://user:pass@localhost:5984";
    const client = {
      db: {
        get: jest.fn().mockResolvedValue({ db_name: "products_tenant-1" }),
        create: jest.fn(),
      },
      use: jest.fn().mockReturnValue({ name: "products_tenant-1" }),
    };
    (Nano as unknown as jest.Mock).mockReturnValue(client);
    const service = new CouchDBService();

    await service.getDatabase("products_tenant-1");
    await service.getDatabase("products_tenant-1");

    expect(client.db.get).toHaveBeenCalledTimes(1);
    expect(client.use).toHaveBeenCalledTimes(1);
  });

  it("shares database initialization across concurrent calls", async () => {
    process.env.COUCHDB_URL = "http://user:pass@localhost:5984";
    const dbHandle = { name: "products_tenant-1" };
    const client = {
      db: {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        create: jest.fn().mockResolvedValue({ ok: true }),
      },
      use: jest.fn().mockReturnValue(dbHandle),
    };
    (Nano as unknown as jest.Mock).mockReturnValue(client);
    const service = new CouchDBService();

    const [first, second] = await Promise.all([
      service.getDatabase("products_tenant-1"),
      service.getDatabase("products_tenant-1"),
    ]);

    expect(client.db.get).toHaveBeenCalledTimes(1);
    expect(client.db.create).toHaveBeenCalledTimes(1);
    expect(client.use).toHaveBeenCalledTimes(1);
    expect(first).toBe(dbHandle);
    expect(second).toBe(dbHandle);
  });

  it("propagates errors that are not a 404 without creating the database", async () => {
    process.env.COUCHDB_URL = "http://user:pass@localhost:5984";
    const client = {
      db: {
        get: jest.fn().mockRejectedValue({ statusCode: 500, message: "boom" }),
        create: jest.fn(),
      },
      use: jest.fn(),
    };
    (Nano as unknown as jest.Mock).mockReturnValue(client);
    const service = new CouchDBService();

    await expect(service.getDatabase("products_tenant-1")).rejects.toEqual(
      expect.objectContaining({ statusCode: 500 })
    );
    expect(client.db.create).not.toHaveBeenCalled();
  });

  it("creates a Mango index through the database handle", async () => {
    process.env.COUCHDB_URL = "http://user:pass@localhost:5984";
    const createIndex = jest.fn().mockResolvedValue({ result: "created" });
    const client = {
      db: {
        get: jest.fn().mockResolvedValue({ db_name: "products_tenant-1" }),
        create: jest.fn(),
      },
      use: jest.fn().mockReturnValue({ createIndex }),
    };
    (Nano as unknown as jest.Mock).mockReturnValue(client);
    const service = new CouchDBService();

    await service.ensureIndex("products_tenant-1", "by_tenant", ["tenantId"]);

    expect(createIndex).toHaveBeenCalledWith({
      index: { fields: ["tenantId"] },
      name: "by_tenant",
    });
  });

  it("installs a missing design document", async () => {
    process.env.COUCHDB_URL = "http://user:pass@localhost:5984";
    const dbHandle = {
      get: jest.fn().mockRejectedValue({ statusCode: 404 }),
      insert: jest.fn().mockResolvedValue({ ok: true }),
    };
    const client = {
      db: { get: jest.fn().mockResolvedValue({}), create: jest.fn() },
      use: jest.fn().mockReturnValue(dbHandle),
    };
    (Nano as unknown as jest.Mock).mockReturnValue(client);
    const service = new CouchDBService();
    const views = {
      stock_by_product_variant: {
        map: "function (doc) { emit(doc.productId, 1); }",
        reduce: "_sum",
      },
    };

    await service.ensureDesignDocument("businessconnect_tenant-1", "stock", views);

    expect(dbHandle.insert).toHaveBeenCalledWith({
      _id: "_design/stock",
      language: "javascript",
      views,
    });
  });

  it("does not rewrite an unchanged design document", async () => {
    process.env.COUCHDB_URL = "http://user:pass@localhost:5984";
    const views = {
      stock_by_product_variant: {
        map: "function (doc) { emit(doc.productId, 1); }",
        reduce: "_sum",
      },
    };
    const dbHandle = {
      get: jest.fn().mockResolvedValue({
        _id: "_design/stock",
        _rev: "1-a",
        language: "javascript",
        views,
      }),
      insert: jest.fn(),
    };
    const client = {
      db: { get: jest.fn().mockResolvedValue({}), create: jest.fn() },
      use: jest.fn().mockReturnValue(dbHandle),
    };
    (Nano as unknown as jest.Mock).mockReturnValue(client);
    const service = new CouchDBService();

    await service.ensureDesignDocument("businessconnect_tenant-1", "stock", views);

    expect(dbHandle.insert).not.toHaveBeenCalled();
  });
});
