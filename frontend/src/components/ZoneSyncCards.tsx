import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Globe, Server, Clock, CheckCircle2, AlertCircle, PlayCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ZoneWithStats {
  id: string;
  code: string;
  name: string;
  vmCount: number;
  lastSync: string | null;
  lastOnboarding: string | null;
  isConfigured: boolean;
  subscriptionCount: number;
  syncScheduleEnabled?: boolean;
  onboardingScheduleEnabled?: boolean;
}

interface ZoneSyncCardsProps {
  zones: ZoneWithStats[];
  syncingZone: string | null;
  selectedFilter: string;
  onSyncZone: (zoneId: string, zoneCode: string) => void;
  onFilterChange: (zoneId: string) => void;
}

export function ZoneSyncCards({
  zones,
  syncingZone,
  selectedFilter,
  onSyncZone,
  onFilterChange,
}: ZoneSyncCardsProps) {
  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return "Nunca";
    try {
      return formatDistanceToNow(new Date(lastSync), {
        addSuffix: true,
        locale: ptBR,
      });
    } catch {
      return "Inválida";
    }
  };

  const totalVMs = zones.reduce((sum, z) => sum + z.vmCount, 0);
  const configuredZones = zones.filter(z => z.isConfigured);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Zonas</h3>
        <Badge variant="secondary" className="text-xs">
          {configuredZones.length}/{zones.length} config. · {totalVMs} VMs
        </Badge>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {/* Card "Todas" */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md",
            selectedFilter === "all" 
              ? "ring-2 ring-primary bg-primary/5" 
              : "hover:bg-muted/50"
          )}
          onClick={() => onFilterChange("all")}
        >
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm">Todas</span>
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Server className="h-3 w-3" />
              <span>{totalVMs} VMs</span>
            </div>
          </CardContent>
        </Card>

        {/* Cards de cada zona */}
        {zones.map((zone) => {
          const isSelected = selectedFilter === zone.id;
          const isSyncing = syncingZone === zone.id;
          const canSync = zone.isConfigured;
          
          return (
            <Card
              key={zone.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isSelected 
                  ? "ring-2 ring-primary bg-primary/5" 
                  : "hover:bg-muted/50",
                !canSync && "opacity-60"
              )}
              onClick={() => onFilterChange(zone.id)}
            >
              <CardContent className="p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">
                    {zone.code}
                  </Badge>
                  <div className="flex items-center gap-0.5">
                    {zone.vmCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        {zone.vmCount}
                      </Badge>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {canSync ? (
                            <CheckCircle2 className="h-3 w-3 text-success" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-warning" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {canSync 
                              ? `${zone.subscriptionCount} subscription(s)` 
                              : "Não configurado"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                
                <p className="text-[10px] text-muted-foreground mb-1 truncate" title={zone.name}>
                  {zone.name}
                </p>

                {canSync ? (
                  <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground mb-1.5">
                    <div className="flex items-center gap-0.5">
                      <RefreshCw className="h-2.5 w-2.5" />
                      <span className="truncate">Sync: {formatLastSync(zone.lastSync)}</span>
                      {zone.syncScheduleEnabled && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Clock className="h-2.5 w-2.5 text-primary" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Agendamento ativo</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <PlayCircle className="h-2.5 w-2.5" />
                      <span className="truncate">Onboard: {formatLastSync(zone.lastOnboarding)}</span>
                      {zone.onboardingScheduleEnabled && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Clock className="h-2.5 w-2.5 text-primary" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Agendamento ativo</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-warning mb-1.5">Não configurado</p>
                )}
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-6 text-[10px] gap-1 px-1"
                        disabled={isSyncing || !canSync}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSyncZone(zone.id, zone.code);
                        }}
                      >
                        <RefreshCw className={cn("h-2.5 w-2.5", isSyncing && "animate-spin")} />
                        {isSyncing ? "Sync..." : "Sync"}
                      </Button>
                    </TooltipTrigger>
                    {!canSync && (
                      <TooltipContent>
                        <p className="text-xs">Configure em Configurações → Zona</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
