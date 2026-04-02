import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ZoneSelector } from "@/components/settings/ZoneSelector";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Clock,
  RefreshCw,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  Calendar,
  Server,
  ShieldCheck,
  GitPullRequestArrow,
  Bell,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface Schedule {
  id?: string;
  zone_id: string;
  schedule_type: string;
  is_enabled: boolean;
  frequency_type: string;
  frequency_value: number;
  execution_time: string;
  batch_size: number;
  last_execution_at: string | null;
  next_execution_at: string | null;
  last_status: string;
  last_error: string | null;
}

interface ZoneInfo {
  id: string;
  code: string;
  name: string;
  pendingVMs: number;
}

type ScheduleType = 'azure_sync' | 'onboarding' | 'credential_analysis' | 'card_status_sync' | 'reminders';

interface ScheduleConfig {
  type: ScheduleType;
  i18nKey: string;
  icon: React.ReactNode;
  defaultFrequency: string;
  defaultTime: string;
  defaultBatchSize: number;
  showBatchSize: boolean;
  runNowAction: (() => Promise<void>) | null;
}

const DEFAULT_SCHEDULE: Omit<Schedule, 'zone_id' | 'schedule_type'> = {
  is_enabled: false,
  frequency_type: 'daily',
  frequency_value: 1,
  execution_time: '02:00',
  batch_size: 10,
  last_execution_at: null,
  next_execution_at: null,
  last_status: 'pending',
  last_error: null,
};

export default function Schedules() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const locale = i18n.language === 'pt-BR' ? ptBR : enUS;

  const [selectedZone, setSelectedZone] = useState<string>("global");
  const [zoneInfo, setZoneInfo] = useState<ZoneInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState<Record<string, boolean>>({});

  // All schedule states in a single map
  const [schedules, setSchedules] = useState<Record<ScheduleType, Schedule>>({
    azure_sync: { ...DEFAULT_SCHEDULE, zone_id: '', schedule_type: 'azure_sync', execution_time: '02:00' },
    onboarding: { ...DEFAULT_SCHEDULE, zone_id: '', schedule_type: 'onboarding', execution_time: '03:00' },
    credential_analysis: { ...DEFAULT_SCHEDULE, zone_id: '', schedule_type: 'credential_analysis', frequency_type: 'monthly', frequency_value: 1, execution_time: '06:00' },
    card_status_sync: { ...DEFAULT_SCHEDULE, zone_id: '', schedule_type: 'card_status_sync', frequency_type: 'hourly', frequency_value: 1, execution_time: '00:00' },
    reminders: { ...DEFAULT_SCHEDULE, zone_id: '', schedule_type: 'reminders', frequency_type: 'daily', execution_time: '08:00' },
  });

  const updateSchedule = (type: ScheduleType, updates: Partial<Schedule>) => {
    setSchedules(prev => ({
      ...prev,
      [type]: { ...prev[type], ...updates },
    }));
  };

  // Run Now handlers
  const handleRunSync = async () => {
    if (!zoneInfo) return;
    setExecuting(prev => ({ ...prev, azure_sync: true }));
    try {
      await api.post('/azure/sync', { zone_id: selectedZone, zone_code: zoneInfo.code });
      toast({ title: t('common.success'), description: t('schedules.syncStarted') });
      setTimeout(() => loadSchedules(selectedZone), 2000);
    } catch {
      toast({ title: t('common.error'), description: "Failed to start sync", variant: "destructive" });
    } finally {
      setExecuting(prev => ({ ...prev, azure_sync: false }));
    }
  };

  const handleRunOnboarding = async () => {
    if (!zoneInfo) return;
    setExecuting(prev => ({ ...prev, onboarding: true }));
    try {
      const vms = await api.get<any[]>(`/azure/vms?zone_id=${selectedZone}&onboarding_status=pending&power_state=running&limit=${schedules.onboarding.batch_size}`);
      if (!vms || vms.length === 0) {
        toast({ title: t('common.info'), description: t('schedules.noPendingVMs') });
        return;
      }
      for (const vm of vms) {
        await api.post('/onboarding/start', { vm_id: vm.id });
      }
      toast({ title: t('common.success'), description: t('schedules.onboardingStarted', { count: vms.length }) });
      setTimeout(() => { loadSchedules(selectedZone); loadZoneInfo(selectedZone); }, 2000);
    } catch {
      toast({ title: t('common.error'), description: "Failed to start onboarding", variant: "destructive" });
    } finally {
      setExecuting(prev => ({ ...prev, onboarding: false }));
    }
  };

  const handleRunAnalysis = async () => {
    setExecuting(prev => ({ ...prev, credential_analysis: true }));
    try {
      await api.post(`/devops-cards/analyze/${selectedZone}`);
      toast({ title: t('common.success'), description: t('schedules.analysisStartedBg') });
    } catch {
      toast({ title: t('common.error'), description: "Failed to start analysis", variant: "destructive" });
    } finally {
      setExecuting(prev => ({ ...prev, credential_analysis: false }));
    }
  };

  const handleRunCardSync = async () => {
    setExecuting(prev => ({ ...prev, card_status_sync: true }));
    try {
      await api.post('/devops-cards/sync-status');
      toast({ title: t('common.success'), description: t('schedules.syncStatusStarted') });
    } catch {
      toast({ title: t('common.error'), description: "Failed to sync card status", variant: "destructive" });
    } finally {
      setExecuting(prev => ({ ...prev, card_status_sync: false }));
    }
  };

  const handleRunReminders = async () => {
    setExecuting(prev => ({ ...prev, reminders: true }));
    try {
      await api.post('/scheduled-reminders/process-cron');
      toast({ title: t('common.success'), description: "Reminders processed" });
    } catch {
      toast({ title: t('common.error'), description: "Failed to process reminders", variant: "destructive" });
    } finally {
      setExecuting(prev => ({ ...prev, reminders: false }));
    }
  };

  const scheduleConfigs: ScheduleConfig[] = [
    {
      type: 'azure_sync',
      i18nKey: 'azureSync',
      icon: <RefreshCw className="h-5 w-5 text-blue-500" />,
      defaultFrequency: 'daily',
      defaultTime: '02:00',
      defaultBatchSize: 10,
      showBatchSize: false,
      runNowAction: handleRunSync,
    },
    {
      type: 'onboarding',
      i18nKey: 'onboarding',
      icon: <Server className="h-5 w-5 text-green-500" />,
      defaultFrequency: 'daily',
      defaultTime: '03:00',
      defaultBatchSize: 10,
      showBatchSize: true,
      runNowAction: handleRunOnboarding,
    },
    {
      type: 'credential_analysis',
      i18nKey: 'credentialAnalysis',
      icon: <ShieldCheck className="h-5 w-5 text-orange-500" />,
      defaultFrequency: 'monthly',
      defaultTime: '06:00',
      defaultBatchSize: 0,
      showBatchSize: false,
      runNowAction: handleRunAnalysis,
    },
    {
      type: 'card_status_sync',
      i18nKey: 'cardStatusSync',
      icon: <GitPullRequestArrow className="h-5 w-5 text-purple-500" />,
      defaultFrequency: 'hourly',
      defaultTime: '00:00',
      defaultBatchSize: 0,
      showBatchSize: false,
      runNowAction: handleRunCardSync,
    },
    {
      type: 'reminders',
      i18nKey: 'reminders',
      icon: <Bell className="h-5 w-5 text-yellow-500" />,
      defaultFrequency: 'daily',
      defaultTime: '08:00',
      defaultBatchSize: 0,
      showBatchSize: false,
      runNowAction: handleRunReminders,
    },
  ];

  useEffect(() => {
    if (selectedZone && selectedZone !== 'global') {
      loadSchedules(selectedZone);
      loadZoneInfo(selectedZone);
    } else {
      // Reset all to defaults
      const resetSchedules: Record<ScheduleType, Schedule> = {} as any;
      for (const cfg of scheduleConfigs) {
        resetSchedules[cfg.type] = {
          ...DEFAULT_SCHEDULE,
          zone_id: '',
          schedule_type: cfg.type,
          frequency_type: cfg.defaultFrequency,
          execution_time: cfg.defaultTime,
          batch_size: cfg.defaultBatchSize,
        };
      }
      setSchedules(resetSchedules);
      setZoneInfo(null);
    }
  }, [selectedZone]);

  const loadZoneInfo = async (zoneId: string) => {
    try {
      const zones = await api.get<any[]>('/zones');
      const zone = zones.find((z: any) => z.id === zoneId);
      if (zone) {
        setZoneInfo({
          id: zone.id,
          code: zone.code,
          name: zone.name,
          pendingVMs: zone.pending_vms_count || 0,
        });
      }
    } catch (error) {
      console.error('Error loading zone info:', error);
    }
  };

  const loadSchedules = async (zoneId: string) => {
    setLoading(true);
    try {
      const data = await api.get<any[]>(`/zones/${zoneId}/schedules`);

      const updated = { ...schedules };
      for (const cfg of scheduleConfigs) {
        const serverData = data?.find((s: any) => s.schedule_type === cfg.type);
        if (serverData) {
          updated[cfg.type] = {
            id: serverData.id,
            zone_id: zoneId,
            schedule_type: cfg.type,
            is_enabled: serverData.is_enabled ?? false,
            frequency_type: serverData.frequency_type ?? cfg.defaultFrequency,
            frequency_value: serverData.frequency_value ?? 1,
            execution_time: serverData.execution_time ?? cfg.defaultTime,
            batch_size: serverData.batch_size ?? cfg.defaultBatchSize,
            last_execution_at: serverData.last_execution_at,
            next_execution_at: serverData.next_execution_at,
            last_status: serverData.last_status ?? 'pending',
            last_error: serverData.last_error,
          };
        } else {
          updated[cfg.type] = {
            ...DEFAULT_SCHEDULE,
            zone_id: zoneId,
            schedule_type: cfg.type,
            frequency_type: cfg.defaultFrequency,
            execution_time: cfg.defaultTime,
            batch_size: cfg.defaultBatchSize,
          };
        }
      }
      setSchedules(updated);
    } catch (error) {
      console.error('Error loading schedules:', error);
      toast({ title: t('common.error'), description: "Failed to load schedules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const calculateNextExecution = (schedule: Schedule): string => {
    const now = new Date();
    let next = new Date();
    const [hours, minutes] = schedule.execution_time.split(':').map(Number);

    switch (schedule.frequency_type) {
      case 'hourly':
        next.setHours(now.getHours() + schedule.frequency_value);
        next.setMinutes(0);
        next.setSeconds(0);
        break;
      case 'daily':
        next.setDate(now.getDate() + schedule.frequency_value);
        next.setHours(hours, minutes, 0, 0);
        break;
      case 'weekly':
        next.setDate(now.getDate() + 7 * schedule.frequency_value);
        next.setHours(hours, minutes, 0, 0);
        break;
      case 'biweekly':
        next.setDate(now.getDate() + 15);
        next.setHours(hours, minutes, 0, 0);
        break;
      case 'monthly':
        next.setMonth(now.getMonth() + schedule.frequency_value);
        next.setDate(schedule.frequency_value > 28 ? 28 : (schedule.frequency_value || 1));
        next.setHours(hours, minutes, 0, 0);
        // For monthly, frequency_value stores the day of month
        const dayOfMonth = schedule.batch_size > 0 ? 1 : schedule.frequency_value;
        next = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth || 1, hours, minutes);
        break;
      default:
        next.setDate(now.getDate() + 1);
        next.setHours(hours, minutes, 0, 0);
    }

    return next.toISOString();
  };

  const handleSave = async () => {
    if (!selectedZone || selectedZone === 'global') {
      toast({ title: t('common.error'), description: t('schedules.selectZoneFirst'), variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      for (const cfg of scheduleConfigs) {
        const sched = schedules[cfg.type];
        const saveData = {
          is_enabled: sched.is_enabled,
          frequency_type: sched.frequency_type,
          frequency_value: sched.frequency_value,
          execution_time: sched.execution_time,
          batch_size: sched.batch_size,
          next_execution_at: sched.is_enabled ? calculateNextExecution(sched) : null,
        };
        await api.put(`/zones/${selectedZone}/schedules/${cfg.type}`, saveData);
      }

      toast({ title: t('common.success'), description: t('schedules.saved') });
      await loadSchedules(selectedZone);
    } catch (error) {
      console.error('Error saving schedules:', error);
      toast({ title: t('common.error'), description: "Failed to save schedules", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatLastExecution = (dateStr: string | null) => {
    if (!dateStr) return t('schedules.never');
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale });
    } catch {
      return t('schedules.invalid');
    }
  };

  const getStatusBadge = (status: string, error: string | null) => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {t('schedules.statusSuccess')}
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            {t('schedules.statusPartial')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1" title={error || ''}>
            <AlertCircle className="h-3 w-3" />
            {t('schedules.statusFailed')}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {t('schedules.statusPending')}
          </Badge>
        );
    }
  };

  const renderScheduleCard = (cfg: ScheduleConfig) => {
    const sched = schedules[cfg.type];

    return (
      <Card key={cfg.type}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {cfg.icon}
              <div>
                <CardTitle className="text-lg">{t(`schedules.${cfg.i18nKey}.title`)}</CardTitle>
                <CardDescription>{t(`schedules.${cfg.i18nKey}.description`)}</CardDescription>
              </div>
            </div>
            <Switch
              checked={sched.is_enabled}
              onCheckedChange={(checked) => updateSchedule(cfg.type, { is_enabled: checked })}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Frequency */}
            <div className="space-y-2">
              <Label>{t('schedules.frequency')}</Label>
              <Select
                value={sched.frequency_type}
                onValueChange={(value) => updateSchedule(cfg.type, { frequency_type: value })}
                disabled={!sched.is_enabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">{t('schedules.frequencyOptions.hourly')}</SelectItem>
                  <SelectItem value="daily">{t('schedules.frequencyOptions.daily')}</SelectItem>
                  <SelectItem value="weekly">{t('schedules.frequencyOptions.weekly')}</SelectItem>
                  <SelectItem value="biweekly">{t('schedules.frequencyOptions.biweekly')}</SelectItem>
                  <SelectItem value="monthly">{t('schedules.frequencyOptions.monthly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Execution time (not for hourly) */}
            {sched.frequency_type !== 'hourly' && (
              <div className="space-y-2">
                <Label>{t('schedules.executionTime')}</Label>
                <Input
                  type="time"
                  value={sched.execution_time}
                  onChange={(e) => updateSchedule(cfg.type, { execution_time: e.target.value })}
                  disabled={!sched.is_enabled}
                />
              </div>
            )}

            {/* Hourly interval */}
            {sched.frequency_type === 'hourly' && (
              <div className="space-y-2">
                <Label>{t('schedules.everyHours')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={sched.frequency_value}
                  onChange={(e) => updateSchedule(cfg.type, { frequency_value: parseInt(e.target.value) || 1 })}
                  disabled={!sched.is_enabled}
                />
              </div>
            )}

            {/* Daily interval (every X days) */}
            {sched.frequency_type === 'daily' && (
              <div className="space-y-2">
                <Label>{t('schedules.everyDays')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={sched.frequency_value}
                  onChange={(e) => updateSchedule(cfg.type, { frequency_value: parseInt(e.target.value) || 1 })}
                  disabled={!sched.is_enabled}
                />
              </div>
            )}

            {/* Day of month for monthly */}
            {sched.frequency_type === 'monthly' && (
              <div className="space-y-2">
                <Label>{t('schedules.dayOfMonth')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={sched.frequency_value}
                  onChange={(e) => updateSchedule(cfg.type, { frequency_value: parseInt(e.target.value) || 1 })}
                  disabled={!sched.is_enabled}
                />
              </div>
            )}

            {/* Batch size (only for applicable types) */}
            {cfg.showBatchSize && (
              <div className="space-y-2">
                <Label>{t('schedules.batchSize')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={sched.batch_size}
                  onChange={(e) => updateSchedule(cfg.type, { batch_size: parseInt(e.target.value) || 10 })}
                  disabled={!sched.is_enabled}
                />
              </div>
            )}
          </div>

          {/* Pending VMs indicator for onboarding */}
          {cfg.type === 'onboarding' && zoneInfo && zoneInfo.pendingVMs > 0 && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span className="text-sm">
                {t('schedules.pendingVMsCount', { count: zoneInfo.pendingVMs })}
              </span>
            </div>
          )}

          <Separator />

          {/* Status and Run Now */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t('schedules.lastExecution')}:</span>
                <span>{formatLastExecution(sched.last_execution_at)}</span>
                {sched.last_status !== 'pending' && getStatusBadge(sched.last_status, sched.last_error)}
              </div>
              {sched.is_enabled && sched.next_execution_at && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('schedules.nextExecution')}:</span>
                  <span>{formatLastExecution(sched.next_execution_at)}</span>
                </div>
              )}
            </div>
            {cfg.runNowAction && (
              <Button
                variant="outline"
                onClick={cfg.runNowAction}
                disabled={executing[cfg.type] || false}
              >
                {executing[cfg.type] ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                {t('schedules.runNow')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <SettingsBreadcrumb />

      <div>
        <h1 className="text-2xl font-bold">{t('schedules.title')}</h1>
        <p className="text-muted-foreground">{t('schedules.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('zoneSelector.title')}</CardTitle>
          <CardDescription>{t('schedules.selectZoneDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ZoneSelector
            selectedZone={selectedZone}
            onZoneChange={setSelectedZone}
            hideGlobal
          />
        </CardContent>
      </Card>

      {selectedZone && selectedZone !== 'global' && (
        <>
          {scheduleConfigs.map(renderScheduleCard)}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t('common.save')}
            </Button>
          </div>
        </>
      )}

      {selectedZone === 'global' && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('schedules.selectZoneFirst')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
