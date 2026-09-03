import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { Tenant } from "@shared/schema";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";

interface CreateTenantFormState {
  name: string;
  address: string;
  phone: string;
  email: string;
  adminUsername: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
}

const emptyForm: CreateTenantFormState = {
  name: "",
  address: "",
  phone: "",
  email: "",
  adminUsername: "",
  adminPassword: "",
  adminFirstName: "",
  adminLastName: "",
  adminEmail: "",
};

export default function PlatformAdmin() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateTenantFormState>(emptyForm);

  const { data: tenants, isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const createTenant = useMutation({
    mutationFn: async (values: CreateTenantFormState) => {
      const response = await apiRequest("POST", "/api/platform/tenants", {
        name: values.name,
        address: values.address || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        adminUsername: values.adminUsername,
        adminPassword: values.adminPassword,
        adminFirstName: values.adminFirstName,
        adminLastName: values.adminLastName,
        adminEmail: values.adminEmail || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("platformTenantCreated"), variant: "success" });
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
    },
    onError: (error: any) => {
      toast({
        title: t("platformTenantCreateFailed"),
        description: error.message || t("anErrorOccurred"),
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: keyof CreateTenantFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTenant.mutate(form);
  };

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("platformAdminTitle")}</h1>
          <Button variant="outline" size="sm" onClick={() => logout()}>
            {t("logout")}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("platformCreateTenantTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant-name">{t("platformTenantName")}</Label>
                  <Input
                    id="tenant-name"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    required
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-phone">{t("platformTenantPhone")}</Label>
                  <Input
                    id="tenant-phone"
                    value={form.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-address">{t("platformTenantAddress")}</Label>
                  <Input
                    id="tenant-address"
                    value={form.address}
                    onChange={(e) => handleChange("address", e.target.value)}
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-email">{t("platformTenantEmail")}</Label>
                  <Input
                    id="tenant-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    disabled={createTenant.isPending}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-username">{t("platformAdminUsername")}</Label>
                  <Input
                    id="admin-username"
                    value={form.adminUsername}
                    onChange={(e) => handleChange("adminUsername", e.target.value)}
                    required
                    autoComplete="off"
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">{t("platformAdminPassword")}</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={form.adminPassword}
                    onChange={(e) => handleChange("adminPassword", e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-first-name">{t("firstName")}</Label>
                  <Input
                    id="admin-first-name"
                    value={form.adminFirstName}
                    onChange={(e) => handleChange("adminFirstName", e.target.value)}
                    required
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-last-name">{t("lastName")}</Label>
                  <Input
                    id="admin-last-name"
                    value={form.adminLastName}
                    onChange={(e) => handleChange("adminLastName", e.target.value)}
                    required
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">
                    {t("email")} ({t("optional")})
                  </Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={form.adminEmail}
                    onChange={(e) => handleChange("adminEmail", e.target.value)}
                    disabled={createTenant.isPending}
                  />
                </div>
              </div>

              <Button type="submit" disabled={createTenant.isPending}>
                {createTenant.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("platformCreatingTenant")}
                  </>
                ) : (
                  t("platformCreateTenantSubmit")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("platformTenantsListTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {tenantsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("platformTenantName")}</TableHead>
                    <TableHead>{t("platformTenantEmail")}</TableHead>
                    <TableHead>{t("platformTenantPhone")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tenants ?? []).map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>{tenant.name}</TableCell>
                      <TableCell>{tenant.email ?? "-"}</TableCell>
                      <TableCell>{tenant.phone ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
