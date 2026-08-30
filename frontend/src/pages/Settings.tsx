import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { useSettings } from "@/hooks/useSettings";
import { usePolicy } from "@/hooks/usePolicy";
import { SettingsPolicy } from "@/lib/policies/settings.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { useLocation } from "wouter";
import {
  Settings as SettingsIcon,
  Store,
  DollarSign,
  Percent,
  Database,
  Download,
  Upload,
  Trash2,
  Save,
  AlertTriangle,
  Info,
} from "lucide-react";
import { getCacheInfo, clearAllCache } from "@/lib/offlineCache";
import { NativeLANDiagnosticsCard } from "@/components/NativeLANDiagnosticsCard";
import { DeviceAuthorizationCard } from "@/components/DeviceAuthorizationCard";
import { DiagnosticsCard } from "@/components/DiagnosticsCard";

// Form schemas
const createCompanySettingsSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t("companyNameRequired")),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().optional(),
});

const createCurrencySettingsSchema = (t: (key: string) => string) => z.object({
  defaultCurrency: z.string().min(1, t("defaultCurrencyRequired")),
  decimalSeparator: z.enum([".", ","]),
  thousandSeparator: z.enum(["none", ",", ".", " "]),
  decimalPlaces: z.number().min(0).max(4),
  symbolPosition: z.enum(["before", "after"]),
});

const taxSettingsSchema = z.object({
  defaultTaxRate: z.number().min(0).max(100),
});

type CompanySettingsForm = z.infer<ReturnType<typeof createCompanySettingsSchema>>;
type CurrencySettingsForm = z.infer<ReturnType<typeof createCurrencySettingsSchema>>;
type TaxSettingsForm = z.infer<typeof taxSettingsSchema>;

export default function Settings() {
  const { t } = useTranslation();
  const companySettingsSchema = createCompanySettingsSchema(t);
  const currencySettingsSchema = createCurrencySettingsSchema(t);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const settingsPolicy = usePolicy(SettingsPolicy);
  const {
    getCompanyName,
    getCompanyAddress,
    getCompanyPhone,
    getCompanyEmail,
    getCompanyWebsite,
    getDefaultCurrency,
    getCurrencyFormat,
    getDefaultTaxRate,
    updateCompanyInfo,
    updateCurrencySettings,
    updateTaxSettings,
    isLoading,
  } = useSettings();

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cacheSize, setCacheSize] = useState<number | null>(null);

  // Company form
  const companyForm = useForm<CompanySettingsForm>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      name: getCompanyName(),
      address: getCompanyAddress(),
      phone: getCompanyPhone(),
      email: getCompanyEmail(),
      website: getCompanyWebsite(),
    },
  });

  // Currency form
  const currencyForm = useForm<CurrencySettingsForm>({
    resolver: zodResolver(currencySettingsSchema),
    defaultValues: {
      defaultCurrency: getDefaultCurrency(),
      ...getCurrencyFormat(),
    },
  });

  // Tax form
  const taxForm = useForm<TaxSettingsForm>({
    resolver: zodResolver(taxSettingsSchema),
    defaultValues: {
      defaultTaxRate: getDefaultTaxRate(),
    },
  });

  // Redirect cashiers away from settings page
  useEffect(() => {
    if (!isLoading && !settingsPolicy.canView()) {
      toast({
        title: t("accessDenied"),
        description: t("youDoNotHavePermissionToAccessSettings"),
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [isLoading, settingsPolicy, setLocation, toast, t]);

  // Update forms when settings load
  useEffect(() => {
    if (!isLoading && settingsPolicy.canView()) {
      companyForm.reset({
        name: getCompanyName(),
        address: getCompanyAddress(),
        phone: getCompanyPhone(),
        email: getCompanyEmail(),
        website: getCompanyWebsite(),
      });

      currencyForm.reset({
        defaultCurrency: getDefaultCurrency(),
        ...getCurrencyFormat(),
      });

      taxForm.reset({
        defaultTaxRate: getDefaultTaxRate(),
      });
    }
  }, [isLoading, settingsPolicy]);

  // Save handlers
  const handleSaveCompanySettings = async (data: CompanySettingsForm) => {
    try {
      await updateCompanyInfo(data);
      toast({
        title: t("success"),
        description: t("settingsSaved"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: t("settingsError"),
        variant: "destructive",
      });
    }
  };

  const handleSaveCurrencySettings = async (data: CurrencySettingsForm) => {
    try {
      await updateCurrencySettings(data.defaultCurrency, {
        decimalSeparator: data.decimalSeparator,
        thousandSeparator: data.thousandSeparator,
        decimalPlaces: data.decimalPlaces,
        symbolPosition: data.symbolPosition,
      });
      toast({
        title: t("success"),
        description: t("settingsSaved"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: t("settingsError"),
        variant: "destructive",
      });
    }
  };

  const handleSaveTaxSettings = async (data: TaxSettingsForm) => {
    try {
      await updateTaxSettings(data.defaultTaxRate);
      toast({
        title: t("success"),
        description: t("settingsSaved"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: t("settingsError"),
        variant: "destructive",
      });
    }
  };

  // Load cache size on mount
  useEffect(() => {
    async function loadCacheInfo() {
      try {
        const info = await getCacheInfo();
        if (info) {
          setCacheSize(info.docCount);
        }
      } catch (error) {
        console.error("Failed to get cache info:", error);
      }
    }
    loadCacheInfo();
  }, []);

  const handleClearCache = async () => {
    try {
      await clearAllCache();
      toast({
        title: t("cacheCleared"),
        description: t("cacheClearedDescription"),
        variant: "default",
      });
      setCacheSize(0);
      setShowClearConfirm(false);
      window.location.reload();
    } catch (error) {
      toast({
        title: t("error"),
        description: t("failedToClearCache"),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t("loadingSettings")}</div>
      </div>
    );
  }

  // If user cannot view settings, show nothing (will redirect)
  if (!settingsPolicy.canView()) {
    return null;
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("settings")}
        </h1>
      </div>

      {/* Company Settings */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Store className="w-5 h-5 mr-2 text-primary" />
            {t("companyInformation")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={companyForm.handleSubmit(handleSaveCompanySettings)}
            className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company-name">{t("companyName")}</Label>
                <Input
                  id="company-name"
                  {...companyForm.register("name")}
                  className="rounded-xl"
                />
                {companyForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {companyForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="company-phone">{t("companyPhone")}</Label>
                <Input
                  id="company-phone"
                  {...companyForm.register("phone")}
                  className="rounded-xl"
                />
              </div>

              <div>
                <Label htmlFor="company-email">{t("companyEmail")}</Label>
                <Input
                  id="company-email"
                  type="email"
                  {...companyForm.register("email")}
                  className="rounded-xl"
                />
                {companyForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {companyForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="company-website">{t("companyWebsite")}</Label>
                <Input
                  id="company-website"
                  {...companyForm.register("website")}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="company-address">{t("companyAddress")}</Label>
              <Textarea
                id="company-address"
                {...companyForm.register("address")}
                className="rounded-xl"
              />
            </div>

            <Button type="submit">
              <Save className="w-4 h-4 mr-2" />
              {t("saveSettings")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Currency & Format Settings */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="w-5 h-5 mr-2 text-primary" />
            {t("currencyNumberFormatting")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={currencyForm.handleSubmit(handleSaveCurrencySettings)}
            className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="defaultCurrency">{t("defaultCurrency")}</Label>
                <Select
                  value={currencyForm.watch("defaultCurrency")}
                  onValueChange={(value) =>
                    currencyForm.setValue("defaultCurrency", value)
                  }>
                  <SelectTrigger className="min-h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XOF">{t("currencyXOF")}</SelectItem>
                    <SelectItem value="EUR">{t("currencyEUR")}</SelectItem>
                    <SelectItem value="USD">{t("currencyUSD")}</SelectItem>
                    <SelectItem value="GBP">{t("currencyGBP")}</SelectItem>
                    <SelectItem value="XAF">{t("currencyXAF")}</SelectItem>
                    <SelectItem value="NGN">{t("currencyNGN")}</SelectItem>
                    <SelectItem value="GHS">{t("currencyGHS")}</SelectItem>
                    <SelectItem value="ZAR">{t("currencyZAR")}</SelectItem>
                    <SelectItem value="KES">{t("currencyKES")}</SelectItem>
                    <SelectItem value="MAD">{t("currencyMAD")}</SelectItem>
                    <SelectItem value="EGP">{t("currencyEGP")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="symbolPosition">{t("symbolPosition")}</Label>
                <Select
                  value={currencyForm.watch("symbolPosition")}
                  onValueChange={(value: "before" | "after") =>
                    currencyForm.setValue("symbolPosition", value)
                  }>
                  <SelectTrigger className="min-h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">{t("symbolBefore")}</SelectItem>
                    <SelectItem value="after">{t("symbolAfter")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="decimalSeparator">
                  {t("decimalSeparator")}
                </Label>
                <Select
                  value={currencyForm.watch("decimalSeparator")}
                  onValueChange={(value: "." | ",") =>
                    currencyForm.setValue("decimalSeparator", value)
                  }>
                  <SelectTrigger className="min-h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=".">{t("decimalDot")}</SelectItem>
                    <SelectItem value=",">{t("decimalComma")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="thousandSeparator">
                  {t("thousandSeparator")}
                </Label>
                <Select
                  value={currencyForm.watch("thousandSeparator")}
                  onValueChange={(value: "none" | "," | "." | " ") =>
                    currencyForm.setValue("thousandSeparator", value)
                  }>
                  <SelectTrigger className="min-h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("thousandNone")}</SelectItem>
                    <SelectItem value=",">{t("thousandComma")}</SelectItem>
                    <SelectItem value=".">{t("thousandDot")}</SelectItem>
                    <SelectItem value=" ">{t("thousandSpace")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="decimalPlaces">{t("decimalPlaces")}</Label>
                <Input
                  id="decimalPlaces"
                  type="number"
                  min="0"
                  max="4"
                  {...currencyForm.register("decimalPlaces", {
                    valueAsNumber: true,
                  })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>{t("formatSettingsApplied")}</AlertDescription>
            </Alert>

            <Button type="submit">
              <Save className="w-4 h-4 mr-2" />
              {t("saveSettings")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tax Settings */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Percent className="w-5 h-5 mr-2 text-primary" />
            {t("taxConfiguration")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={taxForm.handleSubmit(handleSaveTaxSettings)}
            className="space-y-4">
            <div>
              <Label htmlFor="defaultTaxRate">{t("defaultSalesTaxRate")}</Label>
              <Input
                id="defaultTaxRate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                {...taxForm.register("defaultTaxRate", {
                  valueAsNumber: true,
                })}
                className="rounded-xl max-w-xs"
              />
              {taxForm.formState.errors.defaultTaxRate && (
                <p className="text-sm text-destructive">
                  {taxForm.formState.errors.defaultTaxRate.message}
                </p>
              )}
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {t("defaultTaxRateDescription")}
              </AlertDescription>
            </Alert>

            <Button type="submit">
              <Save className="w-4 h-4 mr-2" />
              {t("saveSettings")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <NativeLANDiagnosticsCard />

      <DeviceAuthorizationCard />

      <DiagnosticsCard />

      {/* Offline Data Management */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle>{t("offlineDataManagement")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cache Info */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">{t("cachedItems")}</p>
              <p className="text-sm text-muted-foreground">
                {cacheSize !== null
                  ? `${cacheSize} ${t("itemsStoredLocally")}`
                  : t("loading")}
              </p>
            </div>
            <Database className="h-8 w-8 text-muted-foreground" />
          </div>

          {/* Info about offline data */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{t("offlineDataDescription")}</AlertDescription>
          </Alert>

          {/* Clear cache button */}
          <div className="pt-4 border-t">
            {!showClearConfirm ? (
              <Button
                variant="destructive"
                onClick={() => setShowClearConfirm(true)}
                className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("clearOfflineData")}
              </Button>
            ) : (
              <div className="space-y-3">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t("areYouSure")}</AlertTitle>
                  <AlertDescription>
                    {t("clearOfflineDataWarning")}
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1">
                    {t("cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleClearCache}
                    className="flex-1">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("yesCleanData")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
