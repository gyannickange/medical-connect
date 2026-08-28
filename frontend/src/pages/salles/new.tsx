import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertRoomSchema, type InsertRoom } from "@shared/schema";

const EQUIPMENT_OPTIONS = [
  "Lit médicalisé",
  "Moniteur de signes vitaux",
  "Oxygène mural",
  "Respirateur artificiel",
  "Défibrillateur",
  "Armoire à pharmacie",
];

export default function NewSalle() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const form = useForm<InsertRoom>({
    resolver: zodResolver(insertRoomSchema),
    defaultValues: {
      number: "",
      type: "",
      floor: "",
      capacity: 1,
      equipment: [],
      notes: "",
      status: "disponible",
      tenantId: currentTenant?.id ?? "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: InsertRoom) => {
      const response = await offlineApiRequest(
        "POST",
        "/api/rooms",
        { ...data, tenantId: currentTenant?.id },
        { collection: "rooms" }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: t("success"), description: t("roomCreatedSuccessfully") });
      setLocation("/salles");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateRoom"), t("networkRequestFailed"));
    },
  });

  const equipment = form.watch("equipment") ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("addRoom")}</h1>
      </div>

      <form
        onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
        className="bg-card border border-border rounded-2xl p-6 space-y-4 max-w-3xl"
        data-testid="form-room">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("roomNumberOrName")}</Label>
            <Input {...form.register("number")} data-testid="input-room-number" />
          </div>
          <div className="space-y-2">
            <Label>{t("roomType")}</Label>
            <Input {...form.register("type")} data-testid="input-room-type" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("roomFloor")}</Label>
            <Input {...form.register("floor")} data-testid="input-room-floor" />
          </div>
          <div className="space-y-2">
            <Label>{t("roomCapacity")}</Label>
            <Input type="number" min={1} {...form.register("capacity", { valueAsNumber: true })} data-testid="input-room-capacity" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("roomEquipment")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT_OPTIONS.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={equipment.includes(item)}
                  onCheckedChange={(checked) => {
                    const next = checked ? [...equipment, item] : equipment.filter((e) => e !== item);
                    form.setValue("equipment", next);
                  }}
                  data-testid={`checkbox-equipment-${item}`}
                />
                {item}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("roomNotes")}</Label>
          <Textarea {...form.register("notes")} data-testid="input-room-notes" />
        </div>

        <div className="space-y-2">
          <Label>{t("roomInitialStatus")}</Label>
          <Select value={form.watch("status")} onValueChange={(value) => form.setValue("status", value as InsertRoom["status"])}>
            <SelectTrigger data-testid="select-room-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disponible">{t("roomStatusDisponible")}</SelectItem>
              <SelectItem value="en_maintenance">{t("roomStatusEnMaintenance")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={() => setLocation("/salles")}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={saveMutation.isPending} data-testid="button-create-room">
            {saveMutation.isPending ? t("saving") : t("createRoom")}
          </Button>
        </div>
      </form>
    </div>
  );
}
