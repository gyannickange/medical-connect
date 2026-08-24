import React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Loader2,
  ReceiptText,
} from "lucide-react";
import { useLocation } from "wouter";
import { BrandMark } from "@/components/BrandMark";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import {
  initialSetupSchema,
  persistInitialSetup,
  type InitialSetupValues,
} from "@/lib/initialSetup";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STEP_FIELDS: Array<Array<keyof InitialSetupValues>> = [
  [
    "companyName",
    "companyPhone",
    "companyEmail",
    "companyWebsite",
    "companyAddress",
  ],
  [
    "defaultCurrency",
    "symbolPosition",
    "decimalSeparator",
    "thousandSeparator",
    "decimalPlaces",
  ],
  ["defaultTaxRate"],
  ["autoPrintReceipt", "receiptFormat"],
];

const LAST_STEP = STEP_FIELDS.length - 1;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm text-destructive">{message}</p>;
}

export default function InitialSetup() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const {
    getCompanyName,
    getCompanyAddress,
    getCompanyPhone,
    getCompanyEmail,
    getCompanyWebsite,
    getDefaultCurrency,
    getCurrencyFormat,
    getDefaultTaxRate,
    getAutoPrintReceipt,
    getSetting,
    updateSetting,
    refreshSettings,
  } = useSettings();
  const [step, setStep] = React.useState(0);
  const storedReceiptFormat = getSetting("receiptFormat", "retail");

  const form = useForm<InitialSetupValues>({
    resolver: zodResolver(initialSetupSchema),
    defaultValues: {
      companyName: getCompanyName(),
      companyPhone: getCompanyPhone(),
      companyEmail: getCompanyEmail(),
      companyWebsite: getCompanyWebsite(),
      companyAddress: getCompanyAddress(),
      defaultCurrency: getDefaultCurrency(),
      ...getCurrencyFormat(),
      defaultTaxRate: getDefaultTaxRate(),
      autoPrintReceipt: getAutoPrintReceipt(),
      receiptFormat: storedReceiptFormat === "invoice" ? "invoice" : "retail",
    },
  });

  const previewValues = form.watch();
  const stepLabel = t("stepOf")
    .replace("{current}", String(step + 1))
    .replace("{total}", String(STEP_FIELDS.length));

  const goNext = async () => {
    if (await form.trigger(STEP_FIELDS[step])) {
      setStep((current) => Math.min(current + 1, LAST_STEP));
    }
  };

  const submitSetup = async (values: InitialSetupValues) => {
    try {
      await persistInitialSetup(values, updateSetting);
      await refreshSettings();
      toast({ title: t("setupSaved") });
      setLocation("/");
    } catch (error) {
      console.error("Initial setup failed:", error);
      toast({
        title: t("setupSaveError"),
        variant: "destructive",
      });
    }
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (step < LAST_STEP) {
      event.preventDefault();
      void goNext();
      return;
    }

    void form.handleSubmit(submitSetup)(event);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4 text-foreground">
      <Card className="w-full max-w-4xl">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
          </div>
          <CardTitle className="text-xl font-bold">
            {t("initialSetup")}
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
              {t("initialSetupIntro")}
          </p>
        </CardHeader>

        <CardContent>
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground" aria-live="polite">
              {stepLabel}
            </p>
            <Progress
              value={((step + 1) / STEP_FIELDS.length) * 100}
              aria-label={stepLabel}
              className="h-2 bg-muted"
            />
          </div>

          <form className="mt-6" noValidate onSubmit={handleFormSubmit}>
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    {t("companyInformation")}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("optionalInvoiceDetails")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="setup-company-name">{t("companyName")}</Label>
                  <Input
                    id="setup-company-name"
                    className="min-h-11"
                    autoComplete="organization"
                    aria-invalid={Boolean(form.formState.errors.companyName)}
                    {...form.register("companyName")}
                  />
                  <FieldError message={form.formState.errors.companyName?.message} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="setup-company-phone">{t("companyPhone")}</Label>
                    <Input
                      id="setup-company-phone"
                      className="min-h-11"
                      type="tel"
                      autoComplete="tel"
                      {...form.register("companyPhone")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="setup-company-email">{t("companyEmail")}</Label>
                    <Input
                      id="setup-company-email"
                      className="min-h-11"
                      type="email"
                      autoComplete="email"
                      aria-invalid={Boolean(form.formState.errors.companyEmail)}
                      {...form.register("companyEmail")}
                    />
                    <FieldError message={form.formState.errors.companyEmail?.message} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="setup-company-website">{t("companyWebsite")}</Label>
                    <Input
                      id="setup-company-website"
                      className="min-h-11"
                      type="url"
                      autoComplete="url"
                      {...form.register("companyWebsite")}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="setup-company-address">{t("companyAddress")}</Label>
                    <Textarea
                      id="setup-company-address"
                      autoComplete="street-address"
                      className="min-h-24 glass-input"
                      {...form.register("companyAddress")}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <h2 className="font-display text-lg font-semibold">
                  {t("currencyNumberFormatting")}
                </h2>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Controller
                    control={form.control}
                    name="defaultCurrency"
                    render={({ field }) => (
                      <div className="space-y-2">
                        <Label htmlFor="setup-currency">{t("defaultCurrency")}</Label>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="setup-currency" className="h-12 glass-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="XOF">{t("currencyXOF")}</SelectItem>
                            <SelectItem value="XAF">{t("currencyXAF")}</SelectItem>
                            <SelectItem value="EUR">{t("currencyEUR")}</SelectItem>
                            <SelectItem value="USD">{t("currencyUSD")}</SelectItem>
                            <SelectItem value="GBP">{t("currencyGBP")}</SelectItem>
                            <SelectItem value="NGN">{t("currencyNGN")}</SelectItem>
                            <SelectItem value="GHS">{t("currencyGHS")}</SelectItem>
                            <SelectItem value="ZAR">{t("currencyZAR")}</SelectItem>
                            <SelectItem value="KES">{t("currencyKES")}</SelectItem>
                            <SelectItem value="MAD">{t("currencyMAD")}</SelectItem>
                            <SelectItem value="EGP">{t("currencyEGP")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="symbolPosition"
                    render={({ field }) => (
                      <div className="space-y-2">
                        <Label htmlFor="setup-symbol-position">{t("symbolPosition")}</Label>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="setup-symbol-position" className="h-12 glass-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="before">{t("symbolBefore")}</SelectItem>
                            <SelectItem value="after">{t("symbolAfter")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="decimalSeparator"
                    render={({ field }) => (
                      <div className="space-y-2">
                        <Label htmlFor="setup-decimal-separator">{t("decimalSeparator")}</Label>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="setup-decimal-separator" className="h-12 glass-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value=".">{t("decimalDot")}</SelectItem>
                            <SelectItem value=",">{t("decimalComma")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="thousandSeparator"
                    render={({ field }) => (
                      <div className="space-y-2">
                        <Label htmlFor="setup-thousand-separator">{t("thousandSeparator")}</Label>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="setup-thousand-separator" className="h-12 glass-input">
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
                    )}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="setup-decimal-places">{t("decimalPlaces")}</Label>
                    <Input
                      id="setup-decimal-places"
                      className="min-h-11"
                      type="number"
                      min="0"
                      max="4"
                      inputMode="numeric"
                      aria-invalid={Boolean(form.formState.errors.decimalPlaces)}
                      {...form.register("decimalPlaces", { valueAsNumber: true })}
                    />
                    <FieldError message={form.formState.errors.decimalPlaces?.message} />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    {t("taxConfiguration")}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {t("defaultTaxRateDescription")}
                  </p>
                </div>

                <div className="max-w-sm space-y-2">
                  <Label htmlFor="setup-default-tax-rate">{t("defaultSalesTaxRate")}</Label>
                  <Input
                    id="setup-default-tax-rate"
                    className="min-h-11"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    inputMode="decimal"
                    aria-invalid={Boolean(form.formState.errors.defaultTaxRate)}
                    {...form.register("defaultTaxRate", { valueAsNumber: true })}
                  />
                  <FieldError message={form.formState.errors.defaultTaxRate?.message} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    {t("chooseDocumentFormat")}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("receiptInvoiceDescription")}
                  </p>
                </div>

                <Controller
                  control={form.control}
                  name="receiptFormat"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <Label
                        htmlFor="setup-format-retail"
                        className={cn(
                          "glass-input flex min-h-16 cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/70",
                          field.value === "retail" && "bg-primary/10 ring-2 ring-primary",
                        )}
                      >
                        <RadioGroupItem
                          id="setup-format-retail"
                          value="retail"
                          className="mt-0.5 h-5 w-5 shrink-0"
                        />
                        <ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="space-y-1">
                          <span className="block text-base font-semibold text-foreground">
                            {t("retailReceipt")}
                          </span>
                          <span className="block text-sm font-normal leading-relaxed text-muted-foreground">
                            {t("thermalReceiptSize")}
                          </span>
                        </span>
                      </Label>

                      <Label
                        htmlFor="setup-format-invoice"
                        className={cn(
                          "glass-input flex min-h-16 cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/70",
                          field.value === "invoice" && "bg-primary/10 ring-2 ring-primary",
                        )}
                      >
                        <RadioGroupItem
                          id="setup-format-invoice"
                          value="invoice"
                          className="mt-0.5 h-5 w-5 shrink-0"
                        />
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="space-y-1">
                          <span className="block text-base font-semibold text-foreground">
                            {t("formalInvoice")}
                          </span>
                          <span className="block text-sm font-normal leading-relaxed text-muted-foreground">
                            {t("a4InvoiceSize")}
                          </span>
                        </span>
                      </Label>
                    </RadioGroup>
                  )}
                />

                <Controller
                  control={form.control}
                  name="autoPrintReceipt"
                  render={({ field }) => (
                    <div className="glass-input flex min-h-14 items-center justify-between gap-5 px-4 py-2">
                      <Label
                        htmlFor="setup-auto-print"
                        className="flex min-h-11 flex-1 cursor-pointer flex-col justify-center"
                      >
                        <span className="text-base">
                          {t("autoPrintReceipt")}
                        </span>
                        <span className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">
                          {t("autoPrintReceiptDescription")}
                        </span>
                      </Label>
                      <Switch
                        id="setup-auto-print"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="relative after:absolute after:-inset-x-1 after:-inset-y-2.5"
                      />
                    </div>
                  )}
                />

                <div className="space-y-3">
                  <h3 className="font-display text-lg font-semibold">
                    {previewValues.receiptFormat === "retail"
                      ? t("receiptPreview")
                      : t("invoicePreview")}
                  </h3>
                  <ReceiptPreview
                    format={previewValues.receiptFormat}
                    companyName={previewValues.companyName}
                    companyAddress={previewValues.companyAddress}
                    companyPhone={previewValues.companyPhone}
                    companyEmail={previewValues.companyEmail}
                    companyWebsite={previewValues.companyWebsite}
                    currency={previewValues.defaultCurrency}
                    decimalSeparator={previewValues.decimalSeparator}
                    thousandSeparator={previewValues.thousandSeparator}
                    decimalPlaces={previewValues.decimalPlaces}
                    symbolPosition={previewValues.symbolPosition}
                    taxRate={previewValues.defaultTaxRate}
                  />
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className={cn("min-h-11", step === 0 && "invisible")}
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                tabIndex={step === 0 ? -1 : 0}
                aria-hidden={step === 0}
              >
                <ArrowLeft aria-hidden="true" />
                {t("back")}
              </Button>

              {step < LAST_STEP ? (
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={(event) => {
                    event.preventDefault();
                    void goNext();
                  }}
                >
                  {t("continue")}
                  <ArrowRight aria-hidden="true" />
                </Button>
              ) : (
                <Button type="submit" className="min-h-11" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  )}
                  {t("configureBusinessConnect")}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
