import { useState, useEffect } from "react";
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
  Server
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface Schedule {
  id?: string;
  zone_id: string;
  schedule_type: 'azure_sync' | 'onboarding';
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

export default function Schedules() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const locale = i18n.language === 'pt-BR' ? ptBR : enUS;

  const [selectedZone, setSelectedZone] = useState<string>("global");
  const [zoneInfo, setZoneInfo] = useState<ZoneInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [executingSync, setExecutingSync] = useState(false);
  const [executingOnboard, setExecutingOnboard] = useState(false);

  const [syncSchedule, setSyncSchedule] = useState<Schedule>({
    zone_id: '',
    schedule_type: 'azure_sync',
    is_enabled: false,
    frequency_type: 'daily',
    frequency_value: 1,
    execution_time: '02:00',
    batch_size: 10,
    last_execution_at: null,
    next_execution_at: null,
    last_status: 'pending',
    last_error: null
  });

  const [onboardSchedule, setOnboardSchedule] = useState<Schedule>({
    zone_id: '',
    schedule_type: 'onboarding',
    is_enabled: false,
    frequency_type: 'daily',
    frequency_value: 1,
    execution_time: '03:00',
    batch_size: 10,
    last_execution_at: null,
    next_execution_at: null,
    last_status: 'pending',
    last_error: null
  });

  useEffect(() => {
    if (selectedZone && selectedZone !== 'global') {
      loadSchedules(selectedZone);
      loadZoneInfo(selectedZone);
    } else {
      // Reset to defaults when global
      setSyncSchedule(prev => ({ ...prev, zone_id: '', id: undefined }));
      setOnboardSchedule(prev => ({ ...prev, zone_id: '', id: undefined }));
      setZoneInfo(null);
    }
  }, [selectedZone]);

  const loadZoneInfo = async (zoneId: string) => {
    try {
      const zones = await api.get<any[]>('/zones');
      const zone = zones.find((z: any) => z.id === zoneId);

      if (zone) {
        // The zones endpoint should include pending VM count or we get it from schedules
        setZoneInfo({
          id: zone.id,
          code: zone.code,
          name: zone.name,
          pendingVMs: zone.pending_vms_count || 0
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

      const syncData = data?.find((s: any) => s.schedule_type === 'azure_sync');
      const onboardData = data?.find((s: any) => s.schedule_type === 'onboarding');

      if (syncData) {
        setSyncSchedule({
          id: syncData.id,
          zone_id: zoneId,
          schedule_type: 'azure_sync',
          is_enabled: syncData.is_enabled ?? false,
          frequency_type: syncData.frequency_type ?? 'daily',
          frequency_value: syncData.frequency_value ?? 1,
          execution_time: syncData.execution_time ?? '02:00',
          batch_size: syncData.batch_size ?? 10,
          last_execution_at: syncData.last_execution_at,
          next_execution_at: syncData.next_execution_at,
          last_status: syncData.last_status ?? 'pending',
          last_error: syncData.last_error
        });
      } else {
        setSyncSchedule(prev => ({
          ...prev,
          zone_id: zoneId,
          id: undefined,
          is_enabled: false,
          last_execution_at: null,
          next_execution_at: null,
          last_status: 'pending',
          last_error: null
        }));
      }

      if (onboardData) {
        setOnboardSchedule({
          id: onboardData.id,
          zone_id: zoneId,
          schedule_type: 'onboarding',
          is_enabled: onboardData.is_enabled ?? false,
          frequency_type: onboardData.frequency_type ?? 'daily',
          frequency_value: onboardData.frequency_value ?? 1,
          execution_time: onboardData.execution_time ?? '03:00',
          batch_size: onboardData.batch_size ?? 10,
          last_execution_at: onboardData.last_execution_at,
          next_execution_at: onboardData.next_execution_at,
          last_status: onboardData.last_status ?? 'pending',
          last_error: onboardData.last_error
        });
      } else {
        setOnboardSchedule(prev => ({
          ...prev,
          zone_id: zoneId,
          id: undefined,
          is_enabled: false,
          last_execution_at: null,
          next_execution_at: null,
          last_status: 'pending',
          last_error: null
        }));
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
      toast({
        title: t('common.error'),
        description: "Failed to load schedules",
        variant: "destructive"
      });
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
      default:
        next.setDate(now.getDate() + 1);
        next.setHours(hours, minutes, 0, 0);
    }

    return next.toISOString();
  };

  const handleSave = async () => {
    if (!selectedZone || selectedZone === 'global') {
      toast({
        title: t('common.error'),
        description: t('schedules.selectZoneFirst'),
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      // Save sync schedule
      const syncData = {
        is_enabled: syncSchedule.is_enabled,
        frequency_type: syncSchedule.frequency_type,
        frequency_value: syncSchedule.frequency_value,
        execution_time: syncSchedule.execution_time,
        batch_size: syncSchedule.batch_size,
        next_execution_at: syncSchedule.is_enabled ? calculateNextExecution(syncSchedule) : null
      };

      await api.put(`/zones/${selectedZone}/schedules/azure_sync`, syncData);

      // Save onboard schedule
      const onboardData = {
        is_enabled: onboardSchedule.is_enabled,
        frequency_type: onboardSchedule.frequency_type,
        frequency_value: onboardSchedule.frequency_value,
        execution_time: onboardSchedule.execution_time,
        batch_size: onboardSchedule.batch_size,
        next_execution_at: onboardSchedule.is_enabled ? calculateNextExecution(onboardSchedule) : null
      };

      await api.put(`/zones/${selectedZone}/schedules/onboarding`, onboardData);

      toast({
        title: t('common.success'),
        description: t('schedules.saved')
      });

      // Reload to get IDs
      await loadSchedules(selectedZone);
    } catch (error) {
      console.error('Error saving schedules:', error);
      toast({
        title: t('common.error'),
        description: "Failed to save schedules",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async (type: 'sync' | 'onboard') => {
    if (!zoneInfo) return;

    if (type === 'sync') {
      setExecutingSync(true);
      try {
        await api.post('/maintenance', {
          action: 'request_job',
          job_type: 'sync_azure_vms',
          zone_id: selectedZone,
          zone_code: zoneInfo.code
        });

        toast({
          title: t('common.success'),
          description: t('schedules.syncStarted')
        });

        // Reload schedules to get updated last_execution
        setTimeout(() => loadSchedules(selectedZone), 2000);
      } catch (error) {
        console.error('Error running sync:', error);
        toast({
          title: t('common.error'),
          description: "Failed to start sync",
          variant: "destructive"
        });
      } finally {
        setExecutingSync(false);
      }
    } else {
      setExecutingOnboard(true);
      try {
        // Get pending VMs for this zone from the API
        const vms = await api.get<any[]>(`/azure/vms?zone_id=${selectedZone}&onboarding_status=pending&power_state=running&limit=${onboardSchedule.batch_size}`);

        if (!vms || vms.length === 0) {
          toast({
            title: t('common.info'),
            description: t('schedules.noPendingVMs')
          });
          setExecutingOnboard(false);
          return;
        }

        // Start onboarding for each VM
        for (const vm of vms) {
          await api.post('/onboarding/start', { vm_id: vm.id });
        }

        toast({
          title: t('common.success'),
          description: t('schedules.onboardingStarted', { count: vms.length })
        });

        // Reload info
        setTimeout(() => {
          loadSchedules(selectedZone);
          loadZoneInfo(selectedZone);
        }, 2000);
      } catch (error) {
        console.error('Error running onboarding:', error);
        toast({
          title: t('common.error'),
          description: "Failed to start onboarding",
          variant: "destructive"
        });
      } finally {
        setExecutingOnboard(false);
      }
    }
  };

  const formatLastExecution = (date: string | null) => {
    if (!date) return t('schedules.never');
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale });
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
          {/* Azure Sync Schedule */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">{t('schedules.azureSync.title')}</CardTitle>
                    <CardDescription>{t('schedules.azureSync.description')}</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={syncSchedule.is_enabled}
                  onCheckedChange={(checked) => setSyncSchedule(prev => ({ ...prev, is_enabled: checked }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('schedules.frequency')}</Label>
                  <Select
                    value={syncSchedule.frequency_type}
                    onValueChange={(value) => setSyncSchedule(prev => ({ ...prev, frequency_type: value }))}
                    disabled={!syncSchedule.is_enabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">{t('schedules.frequencyOptions.hourly')}</SelectItem>
                      <SelectItem value="daily">{t('schedules.frequencyOptions.daily')}</SelectItem>
                      <SelectItem value="weekly">{t('schedules.frequencyOptions.weekly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {syncSchedule.frequency_type !== 'hourly' && (
                  <div className="space-y-2">
                    <Label>{t('schedules.executionTime')}</Label>
                    <Input
                      type="time"
                      value={syncSchedule.execution_time}
                      onChange={(e) => setSyncSchedule(prev => ({ ...prev, execution_time: e.target.value }))}
                      disabled={!syncSchedule.is_enabled}
                    />
                  </div>
                )}

                {syncSchedule.frequency_type === 'hourly' && (
                  <div className="space-y-2">
                    <Label>{t('schedules.everyHours')}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={syncSchedule.frequency_value}
                      onChange={(e) => setSyncSchedule(prev => ({ ...prev, frequency_value: parseInt(e.target.value) || 1 }))}
                      disabled={!syncSchedule.is_enabled}
                    />
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('schedules.lastExecution')}:</span>
                    <span>{formatLastExecution(syncSchedule.last_execution_at)}</span>
                    {syncSchedule.last_status !== 'pending' && getStatusBadge(syncSchedule.last_status, syncSchedule.last_error)}
                  </div>
                  {syncSchedule.is_enabled && syncSchedule.next_execution_at && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{t('schedules.nextExecution')}:</span>
                      <span>{formatLastExecution(syncSchedule.next_execution_at)}</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleRunNow('sync')}
                  disabled={executingSync}
                >
                  {executingSync ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-2" />
                  )}
                  {t('schedules.runNow')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Onboarding Schedule */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">{t('schedules.onboarding.title')}</CardTitle>
                    <CardDescription>{t('schedules.onboarding.description')}</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={onboardSchedule.is_enabled}
                  onCheckedChange={(checked) => setOnboardSchedule(prev => ({ ...prev, is_enabled: checked }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('schedules.frequency')}</Label>
                  <Select
                    value={onboardSchedule.frequency_type}
                    onValueChange={(value) => setOnboardSchedule(prev => ({ ...prev, frequency_type: value }))}
                    disabled={!onboardSchedule.is_enabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">{t('schedules.frequencyOptions.hourly')}</SelectItem>
                      <SelectItem value="daily">{t('schedules.frequencyOptions.daily')}</SelectItem>
                      <SelectItem value="weekly">{t('schedules.frequencyOptions.weekly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {onboardSchedule.frequency_type !== 'hourly' && (
                  <div className="space-y-2">
                    <Label>{t('schedules.executionTime')}</Label>
                    <Input
                      type="time"
                      value={onboardSchedule.execution_time}
                      onChange={(e) => setOnboardSchedule(prev => ({ ...prev, execution_time: e.target.value }))}
                      disabled={!onboardSchedule.is_enabled}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>{t('schedules.batchSize')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={onboardSchedule.batch_size}
                    onChange={(e) => setOnboardSchedule(prev => ({ ...prev, batch_size: parseInt(e.target.value) || 10 }))}
                    disabled={!onboardSchedule.is_enabled}
                  />
                </div>
              </div>

              {zoneInfo && zoneInfo.pendingVMs > 0 && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <span className="text-sm">
                    {t('schedules.pendingVMsCount', { count: zoneInfo.pendingVMs })}
                  </span>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('schedules.lastExecution')}:</span>
                    <span>{formatLastExecution(onboardSchedule.last_execution_at)}</span>
                    {onboardSchedule.last_status !== 'pending' && getStatusBadge(onboardSchedule.last_status, onboardSchedule.last_error)}
                  </div>
                  {onboardSchedule.is_enabled && onboardSchedule.next_execution_at && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{t('schedules.nextExecution')}:</span>
                      <span>{formatLastExecution(onboardSchedule.next_execution_at)}</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleRunNow('onboard')}
                  disabled={executingOnboard || !zoneInfo || zoneInfo.pendingVMs === 0}
                >
                  {executingOnboard ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-2" />
                  )}
                  {t('schedules.runNow')}
                </Button>
              </div>
            </CardContent>
          </Card>

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
