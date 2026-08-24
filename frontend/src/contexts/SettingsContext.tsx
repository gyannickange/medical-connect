import React, { createContext, useContext, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "./TenantContext";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import {
  type SettingRecord,
  upsertSettingRecord,
} from "@/lib/settingsCache";

interface SettingsContextType {
  settings: SettingRecord[];
  isLoading: boolean;
  getSetting: (key: string, defaultValue?: any) => any;
  updateSetting: (
    key: string,
    value: any,
    options?: { category?: string; dataType?: string }
  ) => Promise<void>;
  deleteSetting: (id: string) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [cachedSettings, setCachedSettings] = useState<SettingRecord[]>([]);

  // Fetch all settings for the current tenant
  const {
    data: settings = [],
    isLoading,
    refetch,
  } = useQuery<SettingRecord[]>({
    queryKey: ["/api/settings", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const response = await offlineApiRequest(
        "GET",
        `/api/settings?tenantId=${currentTenant.id}`,
        undefined,
        { collection: "settings" }
      );
      const data = await response.json();
      return data;
    },
    enabled: !!currentTenant?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Update cached settings when data changes
  useEffect(() => {
    if (settings && settings.length > 0) {
      setCachedSettings(settings);
    }
  }, [settings]);

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      key,
      value,
      category,
      dataType,
    }: {
      key: string;
      value: string;
      category: string;
      dataType: string;
    }) => {
      if (!currentTenant?.id) throw new Error("No account selected");

      // Check if setting exists
      const existingSetting = cachedSettings.find((s) => s.key === key);

      if (existingSetting) {
        // Update existing setting
        const response = await offlineApiRequest(
          "PUT",
          `/api/settings/key/${key}?tenantId=${currentTenant.id}`,
          {
            tenantId: currentTenant.id,
            key,
            value,
            dataType,
            category,
          },
          { collection: "settings", entityId: existingSetting.id }
        );
        const saved = await response.json();
        return {
          ...saved,
          id: saved.id ?? existingSetting.id,
          tenantId: saved.tenantId ?? currentTenant.id,
          key: saved.key ?? key,
          value: saved.value ?? value,
          category: saved.category ?? category,
          dataType: saved.dataType ?? dataType,
          isEncrypted: saved.isEncrypted ?? existingSetting.isEncrypted,
          createdAt: saved.createdAt ?? existingSetting.createdAt,
          updatedAt: saved.updatedAt ?? existingSetting.updatedAt,
        } satisfies SettingRecord;
      } else {
        // Create new setting
        const response = await offlineApiRequest(
          "POST",
          "/api/settings",
          {
            tenantId: currentTenant.id,
            key,
            value,
            category,
            dataType,
          },
          { collection: "settings" }
        );
        const saved = await response.json();
        const now = new Date().toISOString();
        return {
          ...saved,
          id: saved.id,
          tenantId: saved.tenantId ?? currentTenant.id,
          key: saved.key ?? key,
          value: saved.value ?? value,
          category: saved.category ?? category,
          dataType: saved.dataType ?? dataType,
          isEncrypted: saved.isEncrypted ?? false,
          createdAt: saved.createdAt ?? now,
          updatedAt: saved.updatedAt ?? now,
        } satisfies SettingRecord;
      }
    },
    onSuccess: (savedSetting) => {
      setCachedSettings((previous) =>
        upsertSettingRecord(previous, savedSetting)
      );
      queryClient.invalidateQueries({
        queryKey: ["/api/settings", currentTenant?.id],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await offlineApiRequest(
        "DELETE",
        `/api/settings/${id}`,
        undefined,
        { collection: "settings", entityId: id }
      );
      return { _savedOffline: response.status === 202 };
    },
    onSuccess: (_result, id) => {
      setCachedSettings((previous) =>
        previous.filter((setting) => setting.id !== id)
      );
      queryClient.invalidateQueries({
        queryKey: ["/api/settings", currentTenant?.id],
      });
    },
  });

  // Get a setting by key with optional default value
  const getSetting = (key: string, defaultValue: any = null): any => {
    const setting =
      cachedSettings.find((s) => s.key === key) ??
      settings.find((s) => s.key === key);
    if (!setting) return defaultValue;

    // Parse value based on data type
    switch (setting.dataType) {
      case "boolean":
        return setting.value === "true";
      case "number":
        return parseFloat(setting.value);
      case "json":
        try {
          return JSON.parse(setting.value);
        } catch {
          return defaultValue;
        }
      default:
        return setting.value;
    }
  };

  // Update a setting
  const updateSetting = async (
    key: string,
    value: any,
    options?: { category?: string; dataType?: string }
  ) => {
    // Determine data type if not provided
    let dataType = options?.dataType;
    if (!dataType) {
      if (typeof value === "boolean") dataType = "boolean";
      else if (typeof value === "number") dataType = "number";
      else if (typeof value === "object") dataType = "json";
      else dataType = "string";
    }

    // Convert value to string
    let stringValue: string;
    if (dataType === "json") {
      stringValue = JSON.stringify(value);
    } else {
      stringValue = String(value);
    }

    await updateMutation.mutateAsync({
      key,
      value: stringValue,
      category: options?.category || "general",
      dataType,
    });
  };

  // Refresh settings
  const refreshSettings = async () => {
    await refetch();
  };

  const deleteSetting = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings: cachedSettings,
        isLoading,
        getSetting,
        updateSetting,
        deleteSetting,
        refreshSettings,
      }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettingsContext = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error(
      "useSettingsContext must be used within a SettingsProvider"
    );
  }
  return context;
};
