import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { Clock, Server, Network, Database, CheckCircle2, Loader2 } from "lucide-react";

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
}

interface SyncProgressIndicatorProps {
  isVisible: boolean;
}

const stepConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  authenticating: { label: "Autenticando no Azure...", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  fetching_subscriptions: { label: "Buscando subscriptions...", icon: <Server className="h-4 w-4" /> },
  fetching_vms: { label: "Descobrindo VMs...", icon: <Server className="h-4 w-4" /> },
  processing_nics: { label: "Processando interfaces de rede...", icon: <Network className="h-4 w-4" /> },
  saving: { label: "Salvando no banco de dados...", icon: <Database className="h-4 w-4" /> },
  completed: { label: "Concluído!", icon: <CheckCircle2 className="h-4 w-4 text-success" /> },
};

function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function SyncProgressIndicator({ isVisible }: SyncProgressIndicatorProps) {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Poll for sync progress updates
  useEffect(() => {
    if (!isVisible) {
      setProgress(null);
      setElapsedTime(0);
      return;
    }

    // Fetch the latest running sync progress
    const fetchLatestProgress = async () => {
      try {
        const data = await api.get<{ progress: SyncProgress | null }>('/dashboard/stats?sync_progress=azure_vms');
        if (data?.progress) {
          setProgress(data.progress);
        }
      } catch (error) {
        console.error("Error fetching sync progress:", error);
      }
    };

    fetchLatestProgress();

    // Poll every 3 seconds for progress updates (replaces Supabase realtime)
    const pollInterval = setInterval(fetchLatestProgress, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [isVisible]);

  // Timer for elapsed time
  useEffect(() => {
    if (!isVisible || !progress) return;

    const interval = setInterval(() => {
      if (progress?.started_at) {
        const startedAt = new Date(progress.started_at).getTime();
        const now = Date.now();
        setElapsedTime(Math.floor((now - startedAt) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, progress?.started_at]);

  if (!isVisible) return null;

  const percentage =
    progress && progress.total_count > 0
      ? Math.round((progress.processed_count / progress.total_count) * 100)
      : 0;

  const currentStep = progress?.current_step || "authenticating";
  const stepInfo = stepConfig[currentStep] || stepConfig.authenticating;

  return (
    <div className="mb-4 p-4 bg-primary/5 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {stepInfo.icon}
          <span className="text-sm font-medium">{stepInfo.label}</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{formatElapsedTime(elapsedTime)}</span>
        </div>
      </div>

      <Progress value={percentage} className="h-2 mb-2" />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {progress?.processed_count || 0} / {progress?.total_count || "?"} VMs
        </span>
        <span>{percentage > 0 ? `${percentage}%` : "Iniciando..."}</span>
      </div>
    </div>
  );
}
