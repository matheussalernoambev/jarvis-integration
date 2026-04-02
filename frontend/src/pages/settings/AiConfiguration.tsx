import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ZoneSelector } from "@/components/settings/ZoneSelector";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  Save,
  Loader2,
  TestTube,
  CheckCircle2,
  AlertCircle,
  Users,
  Plus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Settings,
  Link,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────

interface ZoneAiConfig {
  configured: boolean;
  is_enabled: boolean;
  devops_project: string | null;
  devops_work_item_type: string;
  devops_epic_id: number | null;
  devops_feature_id: number | null;
  anthropic_model: string;
  max_cards_per_run: number;
  secrets: {
    devops_org_url: string | null;
    devops_pat_token: string | null;
    anthropic_api_key: string | null;
    anthropic_base_url: string | null;
  };
}

interface PlatformOwner {
  id: string;
  zone_id: string;
  platform_type: string;
  owner1_email: string;
  owner2_email: string | null;
  devops_area_path: string | null;
  devops_iteration_path: string | null;
  is_active: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────

export default function AiConfiguration() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [selectedZone, setSelectedZone] = useState<string>("global");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testingDevops, setTestingDevops] = useState(false);

  // AI Config state
  const [config, setConfig] = useState<ZoneAiConfig>({
    configured: false,
    is_enabled: false,
    devops_project: null,
    devops_work_item_type: "Task",
    devops_epic_id: null,
    devops_feature_id: null,
    anthropic_model: "claude-sonnet-4-20250514",
    max_cards_per_run: 10,
    secrets: { devops_org_url: null, devops_pat_token: null, anthropic_api_key: null },
  });

  // Secrets (editable — masked)
  const [secrets, setSecrets] = useState({
    anthropic_api_key: "",
    devops_org_url: "",
    devops_pat_token: "",
    anthropic_base_url: "",
  });
  const [showSecrets, setShowSecrets] = useState(false);
  const [useCustomBaseUrl, setUseCustomBaseUrl] = useState(false);

  // Platform Owners
  const [owners, setOwners] = useState<PlatformOwner[]>([]);
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [editingOwner, setEditingOwner] = useState<Partial<PlatformOwner> | null>(null);

  // BeyondTrust Platforms (for owner dialog dropdown)
  const [btPlatforms, setBtPlatforms] = useState<string[]>([]);

  const zoneId = selectedZone !== "global" ? selectedZone : null;

  // ─── Fetch ─────────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    try {
      const data = await api.get<ZoneAiConfig>(`/zone-ai-config/${zoneId}`);
      setConfig(data);
      setSecrets({
        anthropic_api_key: "",
        devops_org_url: "",
        devops_pat_token: "",
        anthropic_base_url: "",
      });
      setUseCustomBaseUrl(!!data.secrets.anthropic_base_url);
    } catch {
      toast({ title: t("aiConfig.errorLoading"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  const fetchOwners = useCallback(async () => {
    if (!zoneId) return;
    try {
      const data = await api.get<PlatformOwner[]>(`/platform-owners?zone_id=${zoneId}`);
      setOwners(data || []);
    } catch {
      console.error("Error fetching owners");
    }
  }, [zoneId]);

  const fetchPlatforms = useCallback(async () => {
    try {
      const data = await api.get<{ name: string }[]>("/beyondtrust/cache/platforms");
      const names = (data || []).map((p) => p.name).sort();
      setBtPlatforms(names);
    } catch {
      console.error("Error fetching BT platforms");
    }
  }, []);

  useEffect(() => {
    fetchPlatforms();
  }, [fetchPlatforms]);

  useEffect(() => {
    if (zoneId) {
      fetchConfig();
      fetchOwners();
    }
  }, [zoneId, fetchConfig, fetchOwners]);

  // ─── Save handlers ─────────────────────────────────────────────────────

  const saveConfig = async () => {
    if (!zoneId) return;
    setSaving(true);
    try {
      await api.put(`/zone-ai-config/${zoneId}`, {
        is_enabled: config.is_enabled,
        devops_project: config.devops_project || null,
        devops_work_item_type: config.devops_work_item_type,
        devops_epic_id: config.devops_epic_id || null,
        devops_feature_id: config.devops_feature_id || null,
        anthropic_model: config.anthropic_model,
        max_cards_per_run: config.max_cards_per_run,
      });
      toast({ title: t("aiConfig.configSaved") });
    } catch {
      toast({ title: t("aiConfig.errorSaving"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveSecrets = async () => {
    if (!zoneId) return;
    const payload: Record<string, string> = {};
    if (secrets.anthropic_api_key) payload.anthropic_api_key = secrets.anthropic_api_key;
    if (secrets.devops_org_url) payload.devops_org_url = secrets.devops_org_url;
    if (secrets.devops_pat_token) payload.devops_pat_token = secrets.devops_pat_token;
    if (secrets.anthropic_base_url) payload.anthropic_base_url = secrets.anthropic_base_url;

    if (Object.keys(payload).length === 0) {
      toast({ title: t("aiConfig.noSecretsToSave"), variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await api.put(`/zone-ai-config/${zoneId}/secrets`, payload);
      toast({ title: t("aiConfig.secretsSaved") });
      setSecrets({ anthropic_api_key: "", devops_org_url: "", devops_pat_token: "", anthropic_base_url: "" });
      await fetchConfig();
    } catch {
      toast({ title: t("aiConfig.errorSaving"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Test handlers ─────────────────────────────────────────────────────

  const testAnthropic = async () => {
    if (!zoneId) return;
    setTestingAi(true);
    try {
      const res = await api.post<{ success: boolean; model?: string; error?: string }>(
        `/zone-ai-config/${zoneId}/test-anthropic`
      );
      if (res.success) {
        toast({ title: `${t("aiConfig.anthropicOk")} (${res.model})` });
      } else {
        toast({ title: `${t("aiConfig.anthropicFail")}: ${res.error}`, variant: "destructive" });
      }
    } catch {
      toast({ title: t("aiConfig.anthropicFail"), variant: "destructive" });
    } finally {
      setTestingAi(false);
    }
  };

  const testDevops = async () => {
    if (!zoneId) return;
    setTestingDevops(true);
    try {
      const res = await api.post<{ success: boolean; error?: string }>(
        `/zone-ai-config/${zoneId}/test-devops`
      );
      if (res.success) {
        toast({ title: t("aiConfig.devopsOk") });
      } else {
        toast({ title: `${t("aiConfig.devopsFail")}: ${res.error}`, variant: "destructive" });
      }
    } catch {
      toast({ title: t("aiConfig.devopsFail"), variant: "destructive" });
    } finally {
      setTestingDevops(false);
    }
  };

  // ─── Platform Owner CRUD ───────────────────────────────────────────────

  const openOwnerDialog = (owner?: PlatformOwner) => {
    setEditingOwner(
      owner || {
        zone_id: zoneId || "",
        platform_type: "",
        owner1_email: "",
        owner2_email: "",
        devops_area_path: "",
        devops_iteration_path: "",
        is_active: true,
      }
    );
    setOwnerDialogOpen(true);
  };

  const saveOwner = async () => {
    if (!editingOwner || !zoneId) return;
    try {
      if (editingOwner.id) {
        await api.put(`/platform-owners/${editingOwner.id}`, editingOwner);
      } else {
        await api.post("/platform-owners", { ...editingOwner, zone_id: zoneId });
      }
      toast({ title: t("aiConfig.ownerSaved") });
      setOwnerDialogOpen(false);
      fetchOwners();
    } catch {
      toast({ title: t("aiConfig.errorSaving"), variant: "destructive" });
    }
  };

  const deleteOwner = async (id: string) => {
    try {
      await api.delete(`/platform-owners/${id}`);
      toast({ title: t("aiConfig.ownerDeleted") });
      fetchOwners();
    } catch {
      toast({ title: t("aiConfig.errorDeleting"), variant: "destructive" });
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  if (selectedZone === "global") {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <SettingsBreadcrumb items={[{ label: t("settingsNav.aiConfiguration") }]} />
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{t("aiConfig.title")}</h1>
          <p className="text-muted-foreground">{t("aiConfig.description")}</p>
        </div>
        <ZoneSelector selectedZone={selectedZone} onZoneChange={setSelectedZone} hideGlobal={false} />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("aiConfig.selectZone")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <SettingsBreadcrumb items={[{ label: t("settingsNav.aiConfiguration") }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{t("aiConfig.title")}</h1>
          <p className="text-muted-foreground">{t("aiConfig.description")}</p>
        </div>
        <Badge variant={config.is_enabled ? "default" : "secondary"} className="text-sm">
          {config.is_enabled ? t("aiConfig.enabled") : t("aiConfig.disabled")}
        </Badge>
      </div>

      <ZoneSelector selectedZone={selectedZone} onZoneChange={setSelectedZone} hideGlobal={false} />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">
              <Settings className="h-4 w-4 mr-2" />
              {t("aiConfig.tabGeneral")}
            </TabsTrigger>
            <TabsTrigger value="secrets">
              <Eye className="h-4 w-4 mr-2" />
              {t("aiConfig.tabSecrets")}
            </TabsTrigger>
            <TabsTrigger value="owners">
              <Users className="h-4 w-4 mr-2" />
              {t("aiConfig.tabOwners")}
            </TabsTrigger>
          </TabsList>

          {/* ─── General Config ─────────────────────────────────────────── */}
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  {t("aiConfig.aiSettings")}
                </CardTitle>
                <CardDescription>{t("aiConfig.aiSettingsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t("aiConfig.enableAi")}</Label>
                    <p className="text-sm text-muted-foreground">{t("aiConfig.enableAiDesc")}</p>
                  </div>
                  <Switch
                    checked={config.is_enabled}
                    onCheckedChange={(v) => setConfig({ ...config, is_enabled: v })}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t("aiConfig.anthropicModel")}</Label>
                    <Select
                      value={config.anthropic_model}
                      onValueChange={(v) => setConfig({ ...config, anthropic_model: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                        <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
                        <SelectItem value="claude-opus-4-6">Claude Opus 4.6</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("aiConfig.maxCardsPerRun")}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={config.max_cards_per_run}
                      onChange={(e) => setConfig({ ...config, max_cards_per_run: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    Azure DevOps
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t("aiConfig.devopsProject")}</Label>
                      <Input
                        value={config.devops_project || ""}
                        onChange={(e) => setConfig({ ...config, devops_project: e.target.value })}
                        placeholder="e.g. PasswordSafe"
                      />
                    </div>
                    <div>
                      <Label>{t("aiConfig.workItemType")}</Label>
                      <Select
                        value={config.devops_work_item_type}
                        onValueChange={(v) => setConfig({ ...config, devops_work_item_type: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Task">Task</SelectItem>
                          <SelectItem value="Bug">Bug</SelectItem>
                          <SelectItem value="User Story">User Story</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t("aiConfig.epicId")}</Label>
                      <Input
                        type="number"
                        value={config.devops_epic_id || ""}
                        onChange={(e) => setConfig({ ...config, devops_epic_id: e.target.value ? Number(e.target.value) : null })}
                        placeholder={t("aiConfig.optional")}
                      />
                    </div>
                    <div>
                      <Label>{t("aiConfig.featureId")}</Label>
                      <Input
                        type="number"
                        value={config.devops_feature_id || ""}
                        onChange={(e) => setConfig({ ...config, devops_feature_id: e.target.value ? Number(e.target.value) : null })}
                        placeholder={t("aiConfig.optional")}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveConfig} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {t("common.save")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Secrets ────────────────────────────────────────────────── */}
          <TabsContent value="secrets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("aiConfig.secretsTitle")}</CardTitle>
                <CardDescription>{t("aiConfig.secretsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={() => setShowSecrets(!showSecrets)}>
                    {showSecrets ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    {showSecrets ? t("aiConfig.hideSecrets") : t("aiConfig.showSecrets")}
                  </Button>
                </div>

                <div>
                  <Label>Anthropic API Key</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showSecrets ? "text" : "password"}
                      value={secrets.anthropic_api_key}
                      onChange={(e) => setSecrets({ ...secrets, anthropic_api_key: e.target.value })}
                      placeholder={config.secrets.anthropic_api_key ? "••• (configured)" : t("aiConfig.notConfigured")}
                    />
                    {config.secrets.anthropic_api_key ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={useCustomBaseUrl}
                      onCheckedChange={(checked) => {
                        setUseCustomBaseUrl(checked);
                        if (!checked) setSecrets({ ...secrets, anthropic_base_url: "" });
                      }}
                    />
                    <Label>{t("aiConfig.useCustomBaseUrl")}</Label>
                    {config.secrets.anthropic_base_url && (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    )}
                  </div>
                  {useCustomBaseUrl && (
                    <div className="flex items-center gap-2">
                      <Input
                        type={showSecrets ? "text" : "password"}
                        value={secrets.anthropic_base_url}
                        onChange={(e) => setSecrets({ ...secrets, anthropic_base_url: e.target.value })}
                        placeholder={config.secrets.anthropic_base_url ? "••• (configured)" : "https://your-proxy.example.com"}
                      />
                      {config.secrets.anthropic_base_url ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Azure DevOps Organization URL</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showSecrets ? "text" : "password"}
                      value={secrets.devops_org_url}
                      onChange={(e) => setSecrets({ ...secrets, devops_org_url: e.target.value })}
                      placeholder={config.secrets.devops_org_url ? "••• (configured)" : "https://dev.azure.com/org"}
                    />
                    {config.secrets.devops_org_url ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    )}
                  </div>
                </div>

                <div>
                  <Label>Azure DevOps PAT Token</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showSecrets ? "text" : "password"}
                      value={secrets.devops_pat_token}
                      onChange={(e) => setSecrets({ ...secrets, devops_pat_token: e.target.value })}
                      placeholder={config.secrets.devops_pat_token ? "••• (configured)" : t("aiConfig.notConfigured")}
                    />
                    {config.secrets.devops_pat_token ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    )}
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={testAnthropic} disabled={testingAi}>
                      {testingAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                      {t("aiConfig.testAnthropic")}
                    </Button>
                    <Button variant="outline" onClick={testDevops} disabled={testingDevops}>
                      {testingDevops ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                      {t("aiConfig.testDevops")}
                    </Button>
                  </div>
                  <Button onClick={saveSecrets} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {t("aiConfig.saveSecrets")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Platform Owners ────────────────────────────────────────── */}
          <TabsContent value="owners" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {t("aiConfig.platformOwners")}
                    </CardTitle>
                    <CardDescription>{t("aiConfig.platformOwnersDesc")}</CardDescription>
                  </div>
                  <Button onClick={() => openOwnerDialog()} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("aiConfig.addOwner")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {owners.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">{t("aiConfig.noOwners")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("aiConfig.platformType")}</TableHead>
                        <TableHead>{t("aiConfig.owner1")}</TableHead>
                        <TableHead>{t("aiConfig.owner2")}</TableHead>
                        <TableHead>{t("aiConfig.areaPath")}</TableHead>
                        <TableHead className="text-right">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {owners.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">{o.platform_type}</TableCell>
                          <TableCell>{o.owner1_email}</TableCell>
                          <TableCell>{o.owner2_email || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{o.devops_area_path || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openOwnerDialog(o)}>
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteOwner(o.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ─── Owner Dialog ──────────────────────────────────────────────── */}
      <Dialog open={ownerDialogOpen} onOpenChange={setOwnerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingOwner?.id ? t("aiConfig.editOwner") : t("aiConfig.addOwner")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("aiConfig.platformType")}</Label>
              <Select
                value={editingOwner?.platform_type || ""}
                onValueChange={(v) => setEditingOwner({ ...editingOwner, platform_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("aiConfig.selectPlatform")} />
                </SelectTrigger>
                <SelectContent>
                  {btPlatforms.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("aiConfig.owner1")}</Label>
              <Input
                value={editingOwner?.owner1_email || ""}
                onChange={(e) => setEditingOwner({ ...editingOwner, owner1_email: e.target.value })}
                placeholder="email@company.com"
              />
            </div>
            <div>
              <Label>{t("aiConfig.owner2")}</Label>
              <Input
                value={editingOwner?.owner2_email || ""}
                onChange={(e) => setEditingOwner({ ...editingOwner, owner2_email: e.target.value })}
                placeholder={t("aiConfig.optional")}
              />
            </div>
            <div>
              <Label>{t("aiConfig.areaPath")}</Label>
              <Input
                value={editingOwner?.devops_area_path || ""}
                onChange={(e) => setEditingOwner({ ...editingOwner, devops_area_path: e.target.value })}
                placeholder="Project\\Team\\Area"
              />
            </div>
            <div>
              <Label>{t("aiConfig.iterationPath")}</Label>
              <Input
                value={editingOwner?.devops_iteration_path || ""}
                onChange={(e) => setEditingOwner({ ...editingOwner, devops_iteration_path: e.target.value })}
                placeholder={t("aiConfig.optional")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnerDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveOwner}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
