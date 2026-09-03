import { useQuery } from "@tanstack/react-query";
import { useTenant } from "../../contexts/TenantContext";
import { computeConsultationJourney } from "@/lib/consultationJourney";
import type { Consultation, LabOrder, Patient, Prescription, QueueItem } from "@shared/schema";

export function useConsultationJourney(consultation: Consultation | undefined, patient: Patient | undefined) {
  const { currentTenant } = useTenant();

  const { data: queueItems = [] } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultation?.id}`],
    enabled: !!currentTenant?.id && !!consultation?.id,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultation?.id}`],
    enabled: !!currentTenant?.id && !!consultation?.id,
  });

  if (!consultation || !patient) return [];

  const queueItem = queueItems.find((item) => item.consultationId === consultation.id);
  return computeConsultationJourney(patient, consultation, queueItem, labOrders, prescriptions);
}
