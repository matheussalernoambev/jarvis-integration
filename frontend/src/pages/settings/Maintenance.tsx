import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import {
  RefreshCw,
  GitPullRequest,
  Database,
  Package,
  RotateCcw,
  Rocket,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  Activity,
  Server,
  AlertTriangle,
  Shield,
  Key,
  Settings,
  FileCode,
  Timer,
  Wrench,
  Eye,
  FileText,
  HardDrive,
  Info
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface MaintenanceJob {
  id: string;
  job_type: string;
  status: string;
  requested_by: string;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  output: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

// Categoria de jobs organizados
const JOB_CATEGORIES = {
  updates: {
    titleKey: 'maintenance.categories.updates',
    icon: RefreshCw,
    jobs: [
      { id: 'check_updates', icon: RefreshCw, estimatedTime: '~5s' },
      { id: 'pull_code', icon: GitPullRequest, estimatedTime: '~10s' },
      { id: 'apply_migrations', icon: Database, estimatedTime: '~30s' },
      { id: 'rebuild_frontend', icon: Package, estimatedTime: '~3min' },
      { id: 'restart_services', icon: RotateCcw, estimatedTime: '~30s' },
      { id: 'full_update', icon: Rocket, estimatedTime: '~5min', primary: true },
    ]
  },
  fixes: {
    titleKey: 'maintenance.categories.fixes',
    icon: Wrench,
    jobs: [
      { id: 'fix_auth_schema', icon: Shield, estimatedTime: '~30s' },
      { id: 'fix_permissions', icon: Key, estimatedTime: '~30s' },
      { id: 'fix_vault', icon: Key, estimatedTime: '~20s' },
    ]
  },
  config: {
    titleKey: 'maintenance.categories.config',
    icon: Settings,
    jobs: [
      { id: 'regenerate_compose', icon: FileCode, estimatedTime: '~1min' },
      { id: 'deploy_functions', icon: Rocket, estimatedTime: '~30s' },
      { id: 'setup_cron', icon: Timer, estimatedTime: '~15s' },
      { id: 'reinstall_agent', icon: Wrench, estimatedTime: '~10s' },
    ]
  },
  diagnostics: {
    titleKey: 'maintenance.categories.diagnostics',
    icon: Eye,
    jobs: [
      { id: 'check_status', icon: Activity, estimatedTime: '~5s' },
      { id: 'view_logs', icon: FileText, estimatedTime: '~10s' },
      { id: 'backup_database', icon: HardDrive, estimatedTime: '~1min' },
    ]
  }
} as const;

export default function Maintenance() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const { toast } = useToast();
  
  const [jobs, setJobs] = useState<MaintenanceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState<'online' | 'offline' | 'unknown'>('unknown');
  const [requestingJob, setRequestingJob] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const locale = i18n.language === 'pt-BR' ? ptBR : enUS;

  // ============================================
  // API-based functions
  // ============================================
  const fetchJobs = async () => {
    try {
      const data = await api.get<{ jobs: MaintenanceJob[] }>('/maintenance/jobs');
      setJobs(data.jobs || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAgentStatus = async () => {
    try {
      const data = await api.post<{ agent_status?: string }>('/maintenance', {
        action: 'get_agent_status'
      });

      if (data?.agent_status) {
        setAgentStatus(data.agent_status as 'online' | 'offline' | 'unknown');
      }
    } catch (error) {
      console.error('Error checking agent status:', error);
      setAgentStatus('unknown');
    }
  };

  const requestJob = async (jobType: string) => {
    setRequestingJob(jobType);
    try {
      await api.post('/maintenance', {
        action: 'request_job',
        job_type: jobType
      });

      toast({
        title: t('maintenance.jobRequested'),
        description: t(`maintenance.jobs.${jobType}`),
      });

      await fetchJobs();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: t('common.error'),
        description: message,
        variant: 'destructive'
      });
    } finally {
      setRequestingJob(null);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      await api.post('/maintenance', {
        action: 'cancel_job',
        job_id: jobId
      });

      toast({
        title: t('maintenance.jobCancelled'),
      });

      await fetchJobs();
    } catch (error) {
      console.error('Error cancelling job:', error);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchJobs();
    checkAgentStatus();

    // Poll for job updates every 3 seconds (replaces Supabase realtime)
    const jobsInterval = setInterval(fetchJobs, 3000);

    // Periodic agent status check
    const statusInterval = setInterval(checkAgentStatus, 30000);

    return () => {
      clearInterval(jobsInterval);
      clearInterval(statusInterval);
    };
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />{t('maintenance.status.pending')}</Badge>;
      case 'running':
        return <Badge variant="default" className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t('maintenance.status.running')}</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />{t('maintenance.status.completed')}</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('maintenance.status.failed')}</Badge>;
      case 'cancelled':
        return <Badge variant="outline">{t('maintenance.status.cancelled')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAgentStatusBadge = () => {
    switch (agentStatus) {
      case 'online':
        return <Badge variant="default" className="bg-green-500"><Activity className="h-3 w-3 mr-1" />{t('maintenance.agentOnline')}</Badge>;
      case 'offline':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{t('maintenance.agentOffline')}</Badge>;
      default:
        return <Badge variant="secondary"><Server className="h-3 w-3 mr-1" />{t('maintenance.agentUnknown')}</Badge>;
    }
  };

  const hasActiveJob = jobs.some(j => j.status === 'pending' || j.status === 'running');
  const isAdmin = role === 'admin';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('maintenance.title')}</h1>
          <p className="text-muted-foreground">{t('maintenance.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {getAgentStatusBadge()}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { fetchJobs(); checkAgentStatus(); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Non-admin warning */}
      {!isAdmin && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  {t('maintenance.viewOnlyTitle')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('maintenance.viewOnlyDesc')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Status Info */}
      {isAdmin && agentStatus !== 'online' && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-700 dark:text-yellow-400">
                  {t('maintenance.agentWarningTitle')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('maintenance.agentWarningDesc')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto-installed info */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium text-blue-700 dark:text-blue-400">
                {t('maintenance.autoInstalledTitle')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('maintenance.autoInstalledDesc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(JOB_CATEGORIES).map(([categoryKey, category]) => {
          const CategoryIcon = category.icon;
          return (
            <Card key={categoryKey}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CategoryIcon className="h-5 w-5 text-primary" />
                  {t(category.titleKey)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {category.jobs.map(({ id, icon: Icon, estimatedTime, primary }) => (
                  <div key={id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{t(`maintenance.jobs.${id}`)}</p>
                        <p className="text-xs text-muted-foreground">{estimatedTime}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={primary ? 'default' : 'outline'}
                      disabled={!isAdmin || hasActiveJob || requestingJob !== null}
                      onClick={() => requestJob(id)}
                      title={!isAdmin ? t('maintenance.adminOnly') : undefined}
                    >
                      {requestingJob === id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t('maintenance.run')
                      )}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Jobs History Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('maintenance.historyTitle')}</CardTitle>
          <CardDescription>{t('maintenance.historyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t('maintenance.noJobs')}</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {jobs.map((job) => (
                  <Collapsible
                    key={job.id}
                    open={expandedJob === job.id}
                    onOpenChange={(open) => setExpandedJob(open ? job.id : null)}
                  >
                    <div className="border rounded-lg">
                      <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {getStatusBadge(job.status)}
                          <span className="font-medium text-sm">
                            {t(`maintenance.jobs.${job.job_type}`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(job.requested_at), { 
                              addSuffix: true, 
                              locale 
                            })}
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedJob === job.id ? 'rotate-180' : ''}`} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Separator />
                        <div className="p-3 space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">{t('maintenance.requestedAt')}:</span>
                              <p>{new Date(job.requested_at).toLocaleString()}</p>
                            </div>
                            {job.started_at && (
                              <div>
                                <span className="text-muted-foreground">{t('maintenance.startedAt')}:</span>
                                <p>{new Date(job.started_at).toLocaleString()}</p>
                              </div>
                            )}
                            {job.completed_at && (
                              <div>
                                <span className="text-muted-foreground">{t('maintenance.completedAt')}:</span>
                                <p>{new Date(job.completed_at).toLocaleString()}</p>
                              </div>
                            )}
                            {job.metadata?.user_email && (
                              <div>
                                <span className="text-muted-foreground">{t('maintenance.requestedBy')}:</span>
                                <p>{String(job.metadata.user_email)}</p>
                              </div>
                            )}
                          </div>

                          {job.output && (
                            <div className="mt-2">
                              <p className="text-muted-foreground text-xs mb-1">{t('maintenance.output')}:</p>
                              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap max-h-48">
                                {job.output}
                              </pre>
                            </div>
                          )}

                          {job.error && (
                            <div className="mt-2">
                              <p className="text-destructive text-xs mb-1">{t('maintenance.error')}:</p>
                              <pre className="bg-destructive/10 text-destructive p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap max-h-32">
                                {job.error}
                              </pre>
                            </div>
                          )}

                          {job.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cancelJob(job.id)}
                              className="mt-2"
                            >
                              {t('maintenance.cancel')}
                            </Button>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
