import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, RefreshCw, PlayCircle, Download, Key, Power, PowerOff, Circle, Globe, X } from "lucide-react";
import { toast } from "sonner";
import { SyncProgressIndicator } from "@/components/SyncProgressIndicator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ZoneSyncCards, ZoneWithStats } from "@/components/ZoneSyncCards";
import { OnboardingProgressCell } from "@/components/OnboardingProgressCell";

interface VirtualMachine {
  id: string;
  name: string;
  ip_address: string | null;
  subscription: string;
  subscription_name: string | null;
  resource_group: string;
  os_type: string;
  power_state: string;
  domain_status: string;
  domain_name: string | null;
  onboarding_status: string;
  onboarding_type: string | null;
  onboarding_error: string | null;
  last_synced_at: string | null;
  zone_id: string | null;
}

export default function VirtualMachines() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [vms, setVms] = useState<VirtualMachine[]>([]);
  const [filteredVms, setFilteredVms] = useState<VirtualMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVms, setSelectedVms] = useState<Set<string>>(new Set());
  const [batchOnboarding, setBatchOnboarding] = useState(false);

  // Zone state with stats - initialize from URL param
  const [zonesWithStats, setZonesWithStats] = useState<ZoneWithStats[]>([]);
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>(
    searchParams.get("zone") || "all"
  );
  const [syncingZone, setSyncingZone] = useState<string | null>(null);

  // Sync zone filter with URL
  const handleZoneFilterChange = (zoneId: string) => {
    setSelectedZoneFilter(zoneId);
    if (zoneId === "all") {
      searchParams.delete("zone");
    } else {
      searchParams.set("zone", zoneId);
    }
    setSearchParams(searchParams);
  };

  // Update from URL when it changes externally
  useEffect(() => {
    const zoneFromUrl = searchParams.get("zone");
    if (zoneFromUrl && zoneFromUrl !== selectedZoneFilter) {
      setSelectedZoneFilter(zoneFromUrl);
    } else if (!zoneFromUrl && selectedZoneFilter !== "all") {
      setSelectedZoneFilter("all");
    }
  }, [searchParams]);

  useEffect(() => {
    fetchZonesWithStats();
    fetchVMs();

    // Poll for updates every 15 seconds (replaces realtime subscription)
    const interval = setInterval(() => {
      fetchVMs();
      fetchZonesWithStats();
    }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let filtered = vms;

    // Filter by zone
    if (selectedZoneFilter !== "all") {
      filtered = filtered.filter(vm => vm.zone_id === selectedZoneFilter);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (vm) =>
          vm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vm.subscription.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vm.resource_group.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (vm.domain_name && vm.domain_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredVms(filtered);
  }, [searchTerm, vms, selectedZoneFilter]);

  const fetchZonesWithStats = async () => {
    try {
      // Fetch zones and VMs via API
      const [zonesData, vmsResult, dashboardStats] = await Promise.all([
        api.get('/zones'),
        api.get('/vms'),
        api.get('/dashboard/stats'),
      ]);

      const allVMs = vmsResult.data || [];
      const azureConfigs = dashboardStats.zone_configs || [];
      const schedulesData = dashboardStats.zone_schedules || [];

      // Calculate stats per zone
      const stats: ZoneWithStats[] = (zonesData || []).map((zone: any) => {
        const config = (azureConfigs as any[]).find((c: any) => c.zone_id === zone.id);
        const isConfigured = config?.is_configured === true;
        const subscriptions = config?.subscription_ids || [];
        const subscriptionCount = Array.isArray(subscriptions) ? subscriptions.length : 0;

        const zoneVMs = allVMs.filter((vm: any) => vm.zone_id === zone.id);
        const lastSyncDates = zoneVMs
          .map((vm: any) => vm.last_synced_at)
          .filter(Boolean)
          .sort()
          .reverse();

        // Get schedule info for this zone
        const syncSchedule = (schedulesData as any[]).find(
          (s: any) => s.zone_id === zone.id && s.schedule_type === 'azure_sync'
        );
        const onboardingSchedule = (schedulesData as any[]).find(
          (s: any) => s.zone_id === zone.id && s.schedule_type === 'onboarding'
        );

        return {
          id: zone.id,
          code: zone.code,
          name: zone.name,
          vmCount: zoneVMs.length,
          lastSync: lastSyncDates[0] || null,
          lastOnboarding: onboardingSchedule?.last_execution_at || null,
          isConfigured,
          subscriptionCount,
          syncScheduleEnabled: syncSchedule?.is_enabled || false,
          onboardingScheduleEnabled: onboardingSchedule?.is_enabled || false,
        };
      });

      setZonesWithStats(stats);
    } catch (error) {
      console.error("Error fetching zones with stats:", error);
    }
  };

  const fetchVMs = async () => {
    try {
      setLoading(true);
      const result = await api.get('/vms');
      const data = result.data || [];
      setVms(data);
      setFilteredVms(data);
    } catch (error) {
      console.error("Error fetching VMs:", error);
      toast.error("Erro ao carregar máquinas virtuais");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncZone = async (zoneId: string, zoneCode: string) => {
    setSyncingZone(zoneId);
    setSyncing(true);

    try {
      const data = await api.post('/azure/sync', { zone_id: zoneId, zone_code: zoneCode });

      toast.success(`${data?.synced || 'VMs'} sincronizadas para ${zoneCode}`);
      await Promise.all([fetchVMs(), fetchZonesWithStats()]);
    } catch (error) {
      console.error("Error syncing Azure VMs:", error);
      toast.error(`Falha ao sincronizar VMs para ${zoneCode}`);
    } finally {
      setSyncing(false);
      setSyncingZone(null);
    }
  };

  const handleSyncAll = async () => {
    // Only sync configured zones
    const configuredZones = zonesWithStats.filter(z => z.isConfigured);
    
    if (configuredZones.length === 0) {
      toast.error("Nenhuma zona configurada para sincronização");
      return;
    }

    setSyncing(true);
    let successCount = 0;
    let failCount = 0;

    for (const zone of configuredZones) {
      try {
        setSyncingZone(zone.id);
        await api.post("/azure/sync", { zone_id: zone.id, zone_code: zone.code });
        successCount++;
      } catch (error) {
        console.error(`Error syncing zone ${zone.code}:`, error);
        failCount++;
      }
    }

    setSyncingZone(null);
    setSyncing(false);
    await Promise.all([fetchVMs(), fetchZonesWithStats()]);
    toast.success(`Sincronização concluída: ${successCount} zonas ok, ${failCount} falhas`);
  };

  const handleStartOnboarding = async (vmId: string) => {
    try {
      // OPTIMISTIC: Update local state immediately to show progress bar
      setVms(prev => prev.map(vm => 
        vm.id === vmId 
          ? { ...vm, onboarding_status: 'in_progress', onboarding_error: null }
          : vm
      ));

      const data = await api.post<{ success: boolean; error?: string }>("/onboarding/start", { vm_id: vmId });

      if (!data.success) {
        // Revert on failure
        setVms(prev => prev.map(vm =>
          vm.id === vmId
            ? { ...vm, onboarding_status: 'pending', onboarding_error: data.error || 'Failed' }
            : vm
        ));
        throw new Error(data.error || 'Onboarding failed');
      }

      toast.success("Onboarding iniciado com sucesso");
      // Don't call fetchVMs() here - realtime will update
    } catch (error) {
      console.error("Error starting onboarding:", error);
      toast.error("Falha ao iniciar onboarding");
    }
  };

  const handleBatchOnboarding = async () => {
    if (selectedVms.size === 0) {
      toast.error("Selecione ao menos uma VM");
      return;
    }

    setBatchOnboarding(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const vmId of Array.from(selectedVms)) {
        try {
          const result = await api.post<{ success: boolean; error?: string }>("/onboarding/start", { vm_id: vmId });
          if (!result.success) throw new Error(result.error || 'Failed');
          successCount++;
        } catch (error) {
          console.error(`Error onboarding VM ${vmId}:`, error);
          failCount++;
        }
      }

      toast.success(`Onboarding em lote concluído: ${successCount} sucesso, ${failCount} falhas`);
      setSelectedVms(new Set());
      await fetchVMs();
    } catch (error) {
      console.error("Error in batch onboarding:", error);
      toast.error("Erro no onboarding em lote");
    } finally {
      setBatchOnboarding(false);
    }
  };

  const toggleVmSelection = (vmId: string) => {
    const newSelection = new Set(selectedVms);
    if (newSelection.has(vmId)) {
      newSelection.delete(vmId);
    } else {
      newSelection.add(vmId);
    }
    setSelectedVms(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedVms.size === filteredVms.length) {
      setSelectedVms(new Set());
    } else {
      setSelectedVms(new Set(filteredVms.map(vm => vm.id)));
    }
  };

  const getZoneBadge = (zoneId: string | null) => {
    if (!zoneId) {
      return <Badge variant="outline" className="text-muted-foreground">-</Badge>;
    }
    const zone = zonesWithStats.find(z => z.id === zoneId);
    return (
      <Badge variant="secondary" className="font-mono">
        {zone?.code || 'N/A'}
      </Badge>
    );
  };

  const getPowerStateBadge = (state: string) => {
    const config: Record<string, { className: string; label: string; icon: React.ReactNode }> = {
      running: { 
        className: "bg-success/10 text-success border-success", 
        label: "Ligada",
        icon: <Power className="h-3 w-3" />
      },
      stopped: { 
        className: "bg-warning/10 text-warning border-warning", 
        label: "Parada",
        icon: <PowerOff className="h-3 w-3" />
      },
      deallocated: { 
        className: "bg-muted text-muted-foreground border-muted-foreground", 
        label: "Desalocada",
        icon: <Circle className="h-3 w-3" />
      },
      unknown: { 
        className: "bg-muted text-muted-foreground border-muted-foreground", 
        label: "Desconhecido",
        icon: <Circle className="h-3 w-3" />
      },
    };
    
    const cfg = config[state] || config.unknown;
    
    return (
      <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
        {cfg.icon}
        {cfg.label}
      </Badge>
    );
  };

  const getDomainBadge = (vm: VirtualMachine) => {
    if (vm.domain_status === 'domain_joined') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="default" className="bg-primary/10 text-primary border-primary cursor-help">
                Domínio
              </Badge>
            </TooltipTrigger>
            {vm.domain_name && (
              <TooltipContent>
                <p className="font-mono text-sm">{vm.domain_name}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Standalone
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
      pending: { variant: "outline", className: "bg-warning/10 text-warning border-warning" },
      in_progress: { variant: "default", className: "bg-primary/10 text-primary border-primary" },
      completed: { variant: "outline", className: "bg-success/10 text-success border-success" },
      failed: { variant: "destructive", className: "" },
    };

    const config = variants[status] || variants.pending;
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {status === "pending" && "Pendente"}
        {status === "in_progress" && "Em Progresso"}
        {status === "completed" && "Concluído"}
        {status === "failed" && "Falhou"}
      </Badge>
    );
  };

  const getOnboardingTypeBadge = (type: string | null) => {
    if (!type) return null;
    
    const types: Record<string, { label: string; className: string }> = {
      created: { label: "🆕 Novo", className: "bg-success/10 text-success border-success" },
      already_existed: { label: "✅ Existia", className: "bg-primary/10 text-primary border-primary" },
      partial: { label: "🔄 Parcial", className: "bg-warning/10 text-warning border-warning" },
    };
    
    const config = types[type] || types.created;
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  const canOnboard = (vm: VirtualMachine) => {
    return vm.power_state === 'running';
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{t("vms.title")}</h1>
        <p className="text-muted-foreground">
          {t("vms.subtitle")}
        </p>
      </div>

      {/* Active Zone Filter Banner */}
      {selectedZoneFilter !== "all" && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-sm">
            {t("vms.filteringByZone")}: <strong>{zonesWithStats.find(z => z.id === selectedZoneFilter)?.code || selectedZoneFilter}</strong>
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleZoneFilterChange("all")}
            className="ml-auto h-6 px-2"
          >
            <X className="h-3 w-3 mr-1" />
            {t("vms.clearFilter")}
          </Button>
        </div>
      )}

      <ZoneSyncCards
        zones={zonesWithStats}
        syncingZone={syncingZone}
        selectedFilter={selectedZoneFilter}
        onSyncZone={handleSyncZone}
        onFilterChange={handleZoneFilterChange}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lista de VMs</CardTitle>
              <CardDescription>
                Sincronize VMs do Azure e faça onboarding no BeyondTrust
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {selectedVms.size > 0 && (
                <Button
                  onClick={handleBatchOnboarding}
                  disabled={batchOnboarding}
                  variant="default"
                  className="gap-2"
                >
                  {batchOnboarding ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Processando ({selectedVms.size})...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Onboarding em Lote ({selectedVms.size})
                    </>
                  )}
                </Button>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar VMs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button
                onClick={handleSyncAll}
                disabled={syncing}
                className="gap-2"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Sincronizar Todas Zonas
                  </>
                )}
              </Button>
              <Button onClick={fetchVMs} variant="outline" size="icon" disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SyncProgressIndicator isVisible={syncing} />
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredVms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhuma máquina virtual encontrada</p>
              <p className="text-sm mt-2">
                Clique em "Sincronizar Azure" para buscar VMs ou configure a integração Azure nas configurações
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedVms.size === filteredVms.length && filteredVms.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Resource Group</TableHead>
                  <TableHead>SO</TableHead>
                  <TableHead>Domínio</TableHead>
                  <TableHead>Onboarding</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVms.map((vm) => (
                  <TableRow key={vm.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedVms.has(vm.id)}
                        onChange={() => toggleVmSelection(vm.id)}
                        className="cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{vm.name}</TableCell>
                    <TableCell>{vm.ip_address || "N/A"}</TableCell>
                    <TableCell>{getPowerStateBadge(vm.power_state)}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>{vm.subscription_name || vm.subscription}</span>
                      </div>
                    </TableCell>
                    <TableCell>{vm.resource_group}</TableCell>
                    <TableCell>{vm.os_type}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getDomainBadge(vm)}
                        {vm.domain_name && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {vm.domain_name}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <OnboardingProgressCell 
                        vmId={vm.id} 
                        status={vm.onboarding_status}
                        onboardingType={vm.onboarding_type}
                        onboardingError={vm.onboarding_error}
                      />
                    </TableCell>
                    <TableCell>
                      {vm.onboarding_status === "pending" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  onClick={() => handleStartOnboarding(vm.id)}
                                  disabled={!canOnboard(vm)}
                                  className="gap-2"
                                >
                                  <PlayCircle className="h-4 w-4" />
                                  Iniciar
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!canOnboard(vm) && (
                              <TooltipContent>
                                <p>VM precisa estar ligada para onboarding</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {vm.onboarding_status === "failed" && vm.onboarding_error && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStartOnboarding(vm.id)}
                                  disabled={!canOnboard(vm)}
                                  className="gap-2"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Tentar Novamente
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!canOnboard(vm) && (
                              <TooltipContent>
                                <p>VM precisa estar ligada para onboarding</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}