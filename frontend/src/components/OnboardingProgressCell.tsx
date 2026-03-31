import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, KeyRound, Server, UserPlus, Link, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SyncProgress {
  id: string;
  sync_type: string;
  status: string;
  current_step: string | null;
  processed_count: number;
  total_count: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
  vm_id: string | null;
}

interface OnboardingProgressCellProps {
  vmId: string;
  status: string;
  onboardingType?: string | null;
  onboardingError?: string | null;
}

const stepConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  authenticating: { 
    label: "Autenticando...", 
    icon: <KeyRound className="h-3 w-3" /> 
  },
  searching_asset: { 
    label: "Buscando asset...", 
    icon: <Server className="h-3 w-3" /> 
  },
  creating_system: { 
    label: "Criando sistema...", 
    icon: <Server className="h-3 w-3" /> 
  },
  creating_accounts: { 
    label: "Criando contas...", 
    icon: <UserPlus className="h-3 w-3" /> 
  },
  updating_quickrule: { 
    label: "Vinculando Quick Rule...", 
    icon: <Link className="h-3 w-3" /> 
  },
  completed: { 
    label: "Concluído!", 
    icon: <CheckCircle2 className="h-3 w-3 text-success" /> 
  },
};

const statusBadgeConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string; label: string }> = {
  pending: { variant: "outline", className: "bg-warning/10 text-warning border-warning", label: "Pendente" },
  completed: { variant: "outline", className: "bg-success/10 text-success border-success", label: "Concluído" },
  failed: { variant: "destructive", className: "", label: "Falhou" },
};

const onboardingTypeBadgeConfig: Record<string, { label: string; className: string }> = {
  created: { label: "🆕 Novo", className: "bg-success/10 text-success border-success" },
  already_existed: { label: "✅ Existia", className: "bg-primary/10 text-primary border-primary" },
  partial: { label: "🔄 Parcial", className: "bg-warning/10 text-warning border-warning" },
};

export function OnboardingProgressCell({ 
  vmId, 
  status, 
  onboardingType, 
  onboardingError 
}: OnboardingProgressCellProps) {
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  useEffect(() => {
    if (status !== "in_progress") {
      setProgress(null);
      return;
    }

    console.log(`[OnboardingProgress] Status changed to in_progress for VM ${vmId}`);

    // Fetch progress for this VM via REST API
    const fetchProgress = async () => {
      try {
        console.log(`[OnboardingProgress] Fetching progress for VM ${vmId}...`);
        const data = await api.get<SyncProgress[]>(`/onboarding/logs/${vmId}`);

        if (data && data.length > 0) {
          console.log(`[OnboardingProgress] Got progress:`, data[0].current_step, data[0].processed_count);
          setProgress(data[0]);
        } else {
          console.log(`[OnboardingProgress] No progress record found yet`);
        }
      } catch (error) {
        console.error(`[OnboardingProgress] Error fetching:`, error);
      }
    };

    fetchProgress();

    // Poll every 2 seconds for progress updates
    const pollInterval = setInterval(fetchProgress, 2000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [vmId, status]);

  // Show progress bar for in_progress status
  if (status === "in_progress") {
    const percentage = progress && progress.total_count > 0
      ? Math.round((progress.processed_count / progress.total_count) * 100)
      : 0;

    const currentStep = progress?.current_step || "authenticating";
    const stepInfo = stepConfig[currentStep] || stepConfig.authenticating;

    return (
      <div className="flex flex-col gap-1.5 min-w-[160px]">
        <div className="flex items-center gap-1.5 text-xs text-primary">
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
          <div className="flex items-center gap-1">
            {stepInfo.icon}
            <span className="truncate">{stepInfo.label}</span>
          </div>
        </div>
        <Progress value={percentage} className="h-1.5" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{progress?.processed_count || 0}/{progress?.total_count || 5}</span>
          <span>{percentage > 0 ? `${percentage}%` : "..."}</span>
        </div>
      </div>
    );
  }

  // Show regular badge for other statuses
  const badgeConfig = statusBadgeConfig[status] || statusBadgeConfig.pending;
  const typeBadgeConfig = onboardingType ? onboardingTypeBadgeConfig[onboardingType] : null;

  // For failed status with error, show tooltip
  if (status === "failed" && onboardingError) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help">
              <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
                {badgeConfig.label}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">{onboardingError}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
        {badgeConfig.label}
      </Badge>
      {status === "completed" && typeBadgeConfig && (
        <Badge variant="outline" className={typeBadgeConfig.className}>
          {typeBadgeConfig.label}
        </Badge>
      )}
    </div>
  );
}
