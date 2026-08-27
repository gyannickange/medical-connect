// PouchDB integration for offline-first functionality
import { useEffect, useRef, useState, useCallback } from "react";
import { pouchdbAuthManager } from "./pouchdbAuth";
// Use dynamic imports to avoid bundling conflicts and allow UI to render
// even if PouchDB has compatibility issues
let PouchDB: any = null;
let pouchDBInitialized = false;
let pouchdbLoadPromise: Promise<void> | null = null;

// Define our document interface
interface SyncDocument {
  _id?: string;
  _rev?: string;
}

// Remove the MockPouchDB class - we'll use real PouchDB now

// UMD script loader for PouchDB (bypasses Vite bundling issues)
const loadPouchDBUMD = async (): Promise<void> => {
  if (pouchdbLoadPromise) {
    return pouchdbLoadPromise;
  }

  pouchdbLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof (window as any).PouchDB === "function") {
      console.log("PouchDB UMD already loaded globally");
      pouchdbLoadPromise = null;
      return resolve();
    }

    // Mark as loading
    (window as any).__pouchdb_loading = true;

    // Create script elements for PouchDB core and find plugin
    const pouchdbScript = document.createElement("script");
    const findScript = document.createElement("script");

    // PouchDB version to use (known stable version)
    const version = "8.0.1";

    // Load PouchDB core first
    pouchdbScript.src = `https://cdn.jsdelivr.net/npm/pouchdb@${version}/dist/pouchdb.min.js`;
    pouchdbScript.async = true;
    pouchdbScript.crossOrigin = "anonymous";

    let coreLoaded = false;
    let findLoaded = false;

    const checkComplete = () => {
      if (coreLoaded && findLoaded) {
        (window as any).__pouchdb_loading = false;
        console.log("PouchDB UMD scripts loaded successfully");
        pouchdbLoadPromise = null;
        resolve();
      }
    };

    pouchdbScript.onload = () => {
      console.log("PouchDB core UMD loaded");
      coreLoaded = true;

      // Now load the find plugin
      findScript.src = `https://cdn.jsdelivr.net/npm/pouchdb-find@${version}/dist/pouchdb.find.min.js`;
      findScript.async = true;
      findScript.crossOrigin = "anonymous";

      findScript.onload = () => {
        console.log("PouchDB find plugin UMD loaded");
        findLoaded = true;
        checkComplete();
      };

      findScript.onerror = () => {
        console.log(
          "PouchDB find plugin failed to load, continuing without it"
        );
        findLoaded = true; // Continue without find plugin
        checkComplete();
      };

      document.head.appendChild(findScript);
    };

    pouchdbScript.onerror = () => {
      (window as any).__pouchdb_loading = false;
      pouchdbLoadPromise = null;
      console.error("Failed to load PouchDB core UMD script");
      reject(new Error("Failed to load PouchDB core script"));
    };

    // Add script to DOM to start loading
    document.head.appendChild(pouchdbScript);

    // Timeout fallback
    setTimeout(() => {
      if ((window as any).__pouchdb_loading) {
        (window as any).__pouchdb_loading = false;
        pouchdbLoadPromise = null;
        reject(new Error("PouchDB UMD loading timeout"));
      }
    }, 10000); // 10 second timeout
  });

  return pouchdbLoadPromise;
};

// Dynamic PouchDB initialization
const initializePouchDB = async () => {
  if (pouchDBInitialized) return PouchDB;

  try {
    console.log("Loading PouchDB dynamically...");

    // Strategy 1: Check if PouchDB is available globally (from CDN or pre-loaded)
    if (typeof (window as any).PouchDB === "function") {
      console.log("Using globally available PouchDB");
      PouchDB = (window as any).PouchDB;

      // Try to add find plugin if available
      if (typeof (window as any).pouchdbFind === "function") {
        PouchDB.plugin((window as any).pouchdbFind);
        console.log("Added global find plugin");
      }

      pouchDBInitialized = true;
      return PouchDB;
    }

    // Strategy 2: Use direct module import first to avoid network dependency
    let PouchDBModule: any, PouchFindModule: any;
    console.log("Attempting direct module import...");

    try {
      // Try a more direct approach that might work better with Vite
      PouchDBModule = await import("pouchdb").catch(async () => {
        console.log("pouchdb core failed, trying pouchdb-browser...");
        return await import("pouchdb-browser");
      });

      PouchFindModule = await import("pouchdb-find").catch(() => {
        console.log(
          "pouchdb-find import failed, continuing without find plugin"
        );
        return null;
      });

      console.log("Raw import results:", {
        hasModule: !!PouchDBModule,
        moduleKeys: PouchDBModule ? Object.keys(PouchDBModule) : [],
        moduleType: typeof PouchDBModule,
        hasFind: !!PouchFindModule,
        findKeys: PouchFindModule ? Object.keys(PouchFindModule) : [],
      });
    } catch (importError) {
      console.log("Direct import strategies failed:", importError);
      PouchDBModule = null;
      PouchFindModule = null;
    }

    // Extract the actual constructor from the direct-imported modules, with
    // multiple fallback patterns, and use it immediately if it works. Doing
    // this right after Strategy 2 (rather than only as a last resort after
    // Strategy 3) matters: pouchdb-find has never published a UMD dist file
    // for any version, so Strategy 3's CDN fetch for the find plugin always
    // 404s - falling through to Strategy 3 first would silently lose a
    // find plugin that Strategy 2 already has.
    let PouchDBConstructor: any = null;
    let PouchFindPlugin: any = null;

    if (PouchDBModule) {
      console.log("Extracting PouchDB constructor from modules...");
      const module = PouchDBModule as any;
      PouchDBConstructor = module.default || module.PouchDB || module;

      // If it's still an object, look for constructor property
      if (
        PouchDBConstructor &&
        typeof PouchDBConstructor === "object" &&
        typeof PouchDBConstructor !== "function"
      ) {
        // Try to find constructor in module properties
        for (const key of Object.keys(PouchDBConstructor)) {
          const potential = (PouchDBConstructor as any)[key];
          if (typeof potential === "function" && potential.name === "PouchDB") {
            PouchDBConstructor = potential;
            break;
          }
        }
      }

      if (PouchFindModule) {
        const findModule = PouchFindModule as any;
        PouchFindPlugin =
          findModule.default || findModule.pouchdbFind || findModule;
      }

      console.log("Constructor analysis:", {
        hasConstructor: !!PouchDBConstructor,
        constructorType: typeof PouchDBConstructor,
        constructorName: PouchDBConstructor?.name || "unknown",
        hasPlugin: !!PouchFindPlugin,
        pluginType: typeof PouchFindPlugin,
      });
    }

    if (PouchDBConstructor && typeof PouchDBConstructor === "function") {
      PouchDB = PouchDBConstructor;

      // Try to add the find plugin. PouchDB.plugin() accepts either a
      // function or a plain object of methods to mix into the prototype -
      // pouchdb-find's ESM build exports the latter (an object with
      // createIndex/find/explain/getIndexes/deleteIndex), so this must not
      // require PouchFindPlugin to specifically be a function.
      if (
        PouchFindPlugin &&
        (typeof PouchFindPlugin === "function" ||
          typeof PouchFindPlugin === "object")
      ) {
        try {
          PouchDB.plugin(PouchFindPlugin);
          console.log("PouchDB with find plugin loaded successfully");
        } catch (pluginError) {
          console.log(
            "Find plugin failed to load, continuing without it:",
            pluginError
          );
        }
      } else {
        console.log("PouchDB loaded successfully (without find plugin)");
      }

      pouchDBInitialized = true;
      return PouchDB;
    }

    // Strategy 3: Load PouchDB via UMD script tags (network fallback, used
    // only when the direct import above didn't yield a usable constructor)
    console.log("Loading PouchDB UMD builds dynamically as fallback...");
    try {
      await loadPouchDBUMD();

      // Check if UMD loading was successful
      if (typeof (window as any).PouchDB === "function") {
        console.log("Successfully loaded PouchDB via UMD script tags");
        PouchDB = (window as any).PouchDB;

        // Add find plugin if available
        if (typeof (window as any).pouchdbFind === "function") {
          PouchDB.plugin((window as any).pouchdbFind);
          console.log("Added UMD find plugin");
        }

        pouchDBInitialized = true;
        return PouchDB;
      } else {
        throw new Error("UMD script loading failed to set window.PouchDB");
      }
    } catch (umdError) {
      throw new Error("All import methods failed: " + String(umdError));
    }
  } catch (error) {
    console.log(
      "PouchDB not available in this environment, using fallback mock database:",
      error
    );
    pouchDBInitialized = true; // Mark as initialized even with fallback
    // Return a mock implementation to prevent crashes
    const MockPouchDB = function (name: string) {
      console.log(`Created mock database: ${name}`);
      // Create a mock database instance
      return {
        name,
        _isMock: true,
        info: () => Promise.resolve({ doc_count: 0, update_seq: 0 }),
        put: () => Promise.resolve({ ok: true }),
        get: () => Promise.reject({ name: "not_found" }),
        remove: () => Promise.resolve({ ok: true }),
        changes: () => Promise.resolve({ results: [], last_seq: 0 }),
        sync: () => ({ on: () => {}, cancel: () => {} }),
        createIndex: () => Promise.resolve({ result: "created" }),
        find: () => Promise.resolve({ docs: [] }),
        allDocs: () => Promise.resolve({ rows: [], total_rows: 0, offset: 0 }),
        replicate: {
          to: () => ({ on: () => {}, cancel: () => {} }),
          from: () => ({ on: () => {}, cancel: () => {} }),
        },
        close: () => Promise.resolve(),
      };
    };
    MockPouchDB._isMock = true; // Flag to identify mock
    // Persist the fallback at module level: pouchDBInitialized is now true,
    // so every subsequent call takes the early `if (pouchDBInitialized)
    // return PouchDB;` branch above. Without this assignment, PouchDB stays
    // null forever after the first failure, and every later createPouchDB()
    // call throws "Cannot read properties of null (reading '_isMock')"
    // instead of reusing the mock like this first call does.
    PouchDB = MockPouchDB;
    return MockPouchDB;
  }
};

export const createPouchDB = async (name: string) => {
  const PouchDBClass = await initializePouchDB();
  // Check if it's our mock implementation
  if (PouchDBClass._isMock) {
    return PouchDBClass(name);
  } else {
    // It's real PouchDB, use with 'new'
    return new PouchDBClass(name);
  }
};

export const usePouchDB = (dbName: string) => {
  const db = useRef<PouchDB.Database<SyncDocument> | null>(null);
  const syncRef = useRef<any>(null); // Track active sync to prevent duplicates
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error">(
    "idle"
  );
  const [initialized, setInitialized] = useState(false);

  const createIndexes = async () => {
    if (!db.current) return;

    try {
      // Create index for efficient pending change queries
      await (db.current as any).createIndex({
        index: {
          fields: ["schemaVersion", "state", "tenantId", "deviceId"],
        },
      });
      console.log("Created sync status index");
    } catch (error) {
      // Index may already exist, that's fine
      console.log("Index creation skipped (may already exist):", error);
    }
  };

  useEffect(() => {
    const initializeDB = async () => {
      try {
        db.current = await createPouchDB(dbName);
        await createIndexes();
        setInitialized(true);
        console.log(`Database "${dbName}" ready for use`);
      } catch (error) {
        console.log(
          "Database initialization skipped, offline features disabled"
        );
        setInitialized(false);
      }
    };

    initializeDB();

    return () => {
      // Cancel sync on cleanup
      if (syncRef.current) {
        syncRef.current.cancel();
        syncRef.current = null;
      }
    };
  }, [dbName]);

  // Separate effect for handling online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Don't start sync here - let useOfflineSync manage it
    };

    const handleOffline = () => {
      setIsOnline(false);
      // Cancel sync when going offline
      if (syncRef.current) {
        syncRef.current.cancel();
        syncRef.current = null;
        setSyncStatus("idle");
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Memoize startSync to prevent thrash loop
  const startSync = useCallback(async () => {
    if (!db.current || !isOnline) return;

    // Only sync if CouchDB URL is configured
    const couchUrl = import.meta.env.VITE_COUCHDB_URL;
    if (!couchUrl) {
      console.log("No CouchDB URL configured, skipping sync");
      return;
    }

    // Don't restart if already syncing with same config
    if (syncRef.current) {
      console.log("Sync already active, skipping restart");
      return;
    }

    setSyncStatus("syncing");

    try {
      // Sync with remote CouchDB or other PouchDB instances
      const cloudUrl = `${couchUrl}/${dbName}`;

      // Get tenant ID from dbName (format: medicalconnect_<tenantId>)
      const tenantId = dbName.replace("medicalconnect_", "");

      // Get authenticated sync options
      const syncOptions = await pouchdbAuthManager.getSyncOptions(tenantId, {
        live: true,
        retry: true,
        back_off_function: (delay: number) => {
          // Exponential backoff for failed syncs
          return Math.min(delay * 2, 30000); // Max 30 seconds
        },
      });

      const sync = db.current.sync(cloudUrl, syncOptions);

      // Store sync reference to manage lifecycle
      syncRef.current = sync;

      sync.on("complete", (info: any) => {
        console.log("Sync completed:", info);
        setSyncStatus("idle");
        syncRef.current = null;
      });

      sync.on("error", (err: any) => {
        console.error("Sync error:", err);
        setSyncStatus("error");
        syncRef.current = null;
      });

      sync.on("change", (info: any) => {
        console.log("Sync change:", info);
      });

      return sync;
    } catch (error) {
      console.error("Failed to start sync:", error);
      setSyncStatus("error");
      syncRef.current = null;
    }
  }, [isOnline, dbName]); // Stable dependencies

  const put = async (doc: SyncDocument) => {
    if (!db.current) throw new Error("Database not initialized");
    try {
      return await db.current.put(doc);
    } catch (error) {
      console.error("Failed to put document:", error);
      throw error;
    }
  };

  const get = async (id: string) => {
    if (!db.current) throw new Error("Database not initialized");
    try {
      return await db.current.get(id);
    } catch (error) {
      if ((error as any).name === "not_found") {
        return null;
      }
      console.error("Failed to get document:", error);
      throw error;
    }
  };

  const remove = async (doc: SyncDocument & { _id: string; _rev: string }) => {
    if (!db.current) throw new Error("Database not initialized");
    try {
      return await db.current.remove(doc);
    } catch (error) {
      console.error("Failed to remove document:", error);
      throw error;
    }
  };

  const allDocs = async (options?: PouchDB.Core.AllDocsOptions) => {
    if (!db.current) throw new Error("Database not initialized");
    try {
      return await db.current.allDocs(options);
    } catch (error) {
      console.error("Failed to get all documents:", error);
      throw error;
    }
  };

  const dbFind = async (request: any) => {
    if (!db.current) throw new Error("Database not initialized");
    try {
      // Note: find() requires pouchdb-find plugin
      return await (db.current as any).find(request);
    } catch (error) {
      console.error("Failed to find documents:", error);
      throw error;
    }
  };

  const replicate = {
    to: (
      target: string | PouchDB.Database,
      options?: PouchDB.Replication.ReplicateOptions
    ) => {
      if (!db.current) throw new Error("Database not initialized");
      return db.current.replicate.to(target, options);
    },
    from: (
      source: string | PouchDB.Database,
      options?: PouchDB.Replication.ReplicateOptions
    ) => {
      if (!db.current) throw new Error("Database not initialized");
      return db.current.replicate.from(source, options);
    },
  };

  // Peer-to-peer replication management
  const peerSyncs = useRef<Map<string, any>>(new Map());

  const startPeerSync = useCallback(
    async (peerId: string, peerDbUrl: string) => {
      if (!db.current) {
        console.error("Database not initialized for peer sync");
        return null;
      }

      // Don't create duplicate sync for same peer
      if (peerSyncs.current.has(peerId)) {
        console.log(`Peer sync already active for ${peerId}`);
        return peerSyncs.current.get(peerId);
      }

      console.log(`Starting peer-to-peer sync with ${peerId} at ${peerDbUrl}`);

      try {
        // Extract tenant ID from URL (format: .../api/pouchdb/<tenantId>)
        const tenantIdMatch = peerDbUrl.match(/\/api\/pouchdb\/([^\/]+)/);
        const tenantId = tenantIdMatch ? tenantIdMatch[1] : "";

        if (!tenantId) {
          throw new Error("Could not extract tenant ID from peer URL");
        }

        // Get authenticated sync options
        const syncOptions = await pouchdbAuthManager.getSyncOptions(tenantId, {
          live: true,
          retry: true,
          back_off_function: (delay: number) => {
            // Shorter backoff for peer-to-peer (they're on LAN)
            return Math.min(delay * 1.5, 10000); // Max 10 seconds
          },
        });

        // Create bidirectional sync with peer
        const sync = db.current.sync(peerDbUrl, syncOptions);

        // Store sync reference
        peerSyncs.current.set(peerId, sync);

        sync.on("complete", (info: any) => {
          console.log(`Peer sync completed with ${peerId}:`, info);
          peerSyncs.current.delete(peerId);
        });

        sync.on("error", (err: any) => {
          console.error(`Peer sync error with ${peerId}:`, err);
          peerSyncs.current.delete(peerId);
        });

        sync.on("change", (info: any) => {
          console.log(`Peer sync change with ${peerId}:`, info);
        });

        return sync;
      } catch (error) {
        console.error(`Failed to start peer sync with ${peerId}:`, error);
        return null;
      }
    },
    []
  );

  const stopPeerSync = useCallback((peerId: string) => {
    const sync = peerSyncs.current.get(peerId);
    if (sync) {
      console.log(`Stopping peer sync with ${peerId}`);
      sync.cancel();
      peerSyncs.current.delete(peerId);
    }
  }, []);

  const stopAllPeerSyncs = useCallback(() => {
    console.log("Stopping all peer syncs");
    for (const [peerId, sync] of Array.from(peerSyncs.current.entries())) {
      sync.cancel();
    }
    peerSyncs.current.clear();
  }, []);

  // Cleanup peer syncs when database is destroyed
  useEffect(() => {
    return () => {
      stopAllPeerSyncs();
    };
  }, [stopAllPeerSyncs]);

  return {
    isOnline,
    syncStatus,
    initialized,
    put,
    get,
    remove,
    allDocs,
    dbFind,
    replicate,
    startSync,
    startPeerSync,
    stopPeerSync,
    stopAllPeerSyncs,
  };
};
