import React, { useState } from "react";
import { Plus, Search, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { PatientsPolicy } from "@/lib/policies/patients.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { calculateAge } from "@/lib/patientAge";
import { PatientFormModal } from "@/components/PatientFormModal";
import { PatientDetails } from "@/components/PatientDetails";
import type { Patient } from "@shared/schema";

function statusVariant(status: Patient["status"]): "default" | "secondary" | "destructive" {
  if (status === "hospitalise") return "destructive";
  if (status === "inactif") return "secondary";
  return "default";
}

export default function Patients() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const { data: patientsList = [], isLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id, searchQuery],
    queryFn: async () => {
      const url = searchQuery
        ? `/api/patients/${currentTenant?.id}?q=${encodeURIComponent(searchQuery)}`
        : `/api/patients/${currentTenant?.id}`;
      const response = await fetch(url, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  if (selectedPatientId) {
    return (
      <PatientDetails
        patientId={selectedPatientId}
        onBack={() => setSelectedPatientId(null)}
        onEdit={(patient) => {
          setEditingPatient(patient);
          setShowFormModal(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="patients-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("patients")}</h1>
        </div>
        <PolicyGuard policy={PatientsPolicy} action="canCreate">
          <Button
            className="btn-primary"
            onClick={() => {
              setEditingPatient(null);
              setShowFormModal(true);
            }}
            data-testid="button-add-patient">
            <Plus className="w-4 h-4 mr-2" />
            {t("addPatient")}
          </Button>
        </PolicyGuard>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="relative">
          <Input
            placeholder={t("searchPatientsPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input rounded-xl pl-10"
            data-testid="input-search-patients"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6">
          <h2 className="font-semibold text-foreground">{t("patientRecordsList")}</h2>
          <span className="text-sm text-muted-foreground">
            {t("patientsRegisteredCount").replace("{count}", String(patientsList.length))}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>{t("patient")}</TableHead>
              <TableHead>{t("age")}</TableHead>
              <TableHead>{t("sex")}</TableHead>
              <TableHead>{t("dossierNumber")}</TableHead>
              <TableHead>{t("assignedService")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t("loading")}
                </TableCell>
              </TableRow>
            ) : patientsList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? t("noPatientsMatchSearch") : t("addFirstPatient")}
                </TableCell>
              </TableRow>
            ) : (
              patientsList.map((patient) => (
                <TableRow
                  key={patient.id}
                  className="border-border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedPatientId(patient.id)}
                  data-testid={`row-patient-${patient.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={undefined} />
                        <AvatarFallback>{patient.firstName[0]}{patient.lastName[0]}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">
                        {patient.firstName} {patient.lastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{calculateAge(patient.dateOfBirth)}</TableCell>
                  <TableCell>{patient.sex}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {patient.dossierNumber ?? t("pendingSync")}
                  </TableCell>
                  <TableCell>{patient.facilityService ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={statusVariant(patient.status)}>
                      {t(`patientStatus${patient.status[0].toUpperCase()}${patient.status.slice(1)}`)}
                    </Badge>
                    <ChevronRight className="inline w-4 h-4 ml-2 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PatientFormModal
        open={showFormModal}
        editingPatient={editingPatient}
        onClose={() => {
          setShowFormModal(false);
          setEditingPatient(null);
        }}
      />
    </div>
  );
}
