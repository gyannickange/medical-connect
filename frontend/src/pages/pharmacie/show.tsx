import React, { useState } from "react";
import { ArrowLeft, CheckCircle, ListChecks, Printer } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { PrescriptionsPolicy } from "@/lib/policies/prescriptions.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { DispenseStatus, Prescription, PrescriptionLine } from "@shared/schema";

function statusLabelKey(status: string): string {
  return "prescriptionStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function dispenseStatusLabelKey(status: string): string {
  return "dispenseStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function PrescriptionDetails() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const [partialDialogOpen, setPartialDialogOpen] = useState(false);
  const [draftLines, setDraftLines] = useState<PrescriptionLine[] | null>(null);

  const { data: prescription } = useQuery<Prescription>({
    queryKey: ["/api/prescriptions/detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/prescriptions/detail/${id}`, { credentials: "include" });
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (lines: PrescriptionLine[]) => {
      const response = await offlineApiRequest("PUT", `/api/prescriptions/${id}`, { lines }, { collection: "prescriptions", entityId: id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prescriptions/detail", id] });
      queryClient.invalidateQueries({ queryKey: [`/api/prescriptions/${currentTenant?.id}`] });
      if (prescription) {
        queryClient.invalidateQueries({ queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${prescription.consultationId}`] });
      }
      toast({ title: t("success"), description: t("prescriptionUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdatePrescription"), t("networkRequestFailed"));
    },
  });

  function openPartialDelivery() {
    if (!prescription) return;
    setDraftLines(prescription.lines);
    setPartialDialogOpen(true);
  }

  function updateDraftLine(index: number, dispenseStatus: DispenseStatus) {
    setDraftLines((prev) => (prev ? prev.map((line, i) => (i === index ? { ...line, dispenseStatus } : line)) : prev));
  }

  if (!prescription) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="prescription-detail-page">
      <Button variant="ghost" onClick={() => setLocation("/pharmacie")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("pharmacieTitle")}
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">{t("prescriptionDetailTitle")}</h1>
        <Badge>{t(statusLabelKey(prescription.status))}</Badge>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4">
          <h2 className="font-semibold text-foreground">{t("medicationsPrescribedSection")}</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("drugNameLabel")}</TableHead>
              <TableHead>{t("dosageLabel")}</TableHead>
              <TableHead>{t("frequencyLabel")}</TableHead>
              <TableHead>{t("durationDaysLabel")}</TableHead>
              <TableHead>{t("quantityLabel")}</TableHead>
              <TableHead>{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prescription.lines.map((line, index) => (
              <TableRow key={index} data-testid={`row-prescription-line-${index}`}>
                <TableCell>{line.drugName}</TableCell>
                <TableCell>{line.dosage}</TableCell>
                <TableCell>{line.frequency}</TableCell>
                <TableCell>{line.durationDays ?? "—"}</TableCell>
                <TableCell>{line.quantity ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={line.dispenseStatus === "indisponible" ? "destructive" : line.dispenseStatus === "delivre" ? "secondary" : "default"}>
                    {t(dispenseStatusLabelKey(line.dispenseStatus))}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => window.print()} data-testid="button-print-ticket">
          <Printer className="w-4 h-4 mr-2" />
          {t("printTicket")}
        </Button>
        <PolicyGuard policy={PrescriptionsPolicy} action="canUpdate">
          <>
            {(prescription.status === "en_attente" || prescription.status === "prepare" || prescription.status === "delivre_partiel") && (
              <>
                <Button variant="outline" onClick={openPartialDelivery} data-testid="button-partial-delivery">
                  <ListChecks className="w-4 h-4 mr-2" />
                  {t("partialDelivery")}
                </Button>
                <Button
                  className="btn-primary"
                  onClick={() => updateMutation.mutate(prescription.lines.map((line) => ({ ...line, dispenseStatus: "delivre" as const })))}
                  disabled={updateMutation.isPending}
                  data-testid="button-deliver-prescription">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t("deliverPrescription")}
                </Button>
              </>
            )}
          </>
        </PolicyGuard>
      </div>

      <Dialog open={partialDialogOpen} onOpenChange={setPartialDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("partialDelivery")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {draftLines?.map((line, index) => (
              <div key={index} className="space-y-1">
                <Label>{line.drugName} — {line.dosage}</Label>
                <RadioGroup value={line.dispenseStatus} onValueChange={(v) => updateDraftLine(index, v as DispenseStatus)} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="en_attente" id={`line-${index}-en-attente`} />
                    <Label htmlFor={`line-${index}-en-attente`}>{t("dispenseStatusEnAttente")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="delivre" id={`line-${index}-delivre`} />
                    <Label htmlFor={`line-${index}-delivre`}>{t("dispenseStatusDelivre")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="indisponible" id={`line-${index}-indisponible`} />
                    <Label htmlFor={`line-${index}-indisponible`}>{t("dispenseStatusIndisponible")}</Label>
                  </div>
                </RadioGroup>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              className="btn-primary"
              onClick={() => {
                if (draftLines) updateMutation.mutate(draftLines);
                setPartialDialogOpen(false);
              }}
              data-testid="button-confirm-partial-delivery">
              {t("partialDelivery")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
