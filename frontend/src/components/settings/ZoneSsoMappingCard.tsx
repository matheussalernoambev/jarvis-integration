import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Shield, Users, Eye, Loader2, Save, Info } from "lucide-react";

interface Zone {
  id: string;
  code: string;
  name: string;
}

interface ZoneSsoConfig {
  zone_id: string;
  admin_group_id: string | null;
  operator_group_id: string | null;
  viewer_group_id: string | null;
}

export function ZoneSsoMappingCard() {
  const { t } = useTranslation();
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [config, setConfig] = useState<ZoneSsoConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [adminGroupId, setAdminGroupId] = useState("");
  const [operatorGroupId, setOperatorGroupId] = useState("");
  const [viewerGroupId, setViewerGroupId] = useState("");

  useEffect(() => {
    fetchZones();
  }, []);

  useEffect(() => {
    if (selectedZone) {
      fetchZoneConfig(selectedZone);
    }
  }, [selectedZone]);

  const fetchZones = async () => {
    try {
      const data = await api.get<(Zone & { is_active: boolean })[]>('/zones');
      const activeZones = (data || []).filter(z => z.is_active);
      setZones(activeZones);

      if (activeZones.length > 0) {
        setSelectedZone(activeZones[0].id);
      }
    } catch (error) {
      console.error("Error fetching zones:", error);
    }
  };

  const fetchZoneConfig = async (zoneId: string) => {
    setLoading(true);
    try {
      const data = await api.get<ZoneSsoConfig | null>('/zones/' + zoneId + '/sso-config');

      if (data) {
        setConfig(data);
        setAdminGroupId(data.admin_group_id || "");
        setOperatorGroupId(data.operator_group_id || "");
        setViewerGroupId(data.viewer_group_id || "");
      } else {
        setConfig(null);
        setAdminGroupId("");
        setOperatorGroupId("");
        setViewerGroupId("");
      }
    } catch (error) {
      console.error("Error fetching zone SSO config:", error);
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedZone) return;

    setSaving(true);
    try {
      const payload = {
        admin_group_id: adminGroupId.trim() || null,
        operator_group_id: operatorGroupId.trim() || null,
        viewer_group_id: viewerGroupId.trim() || null,
      };

      await api.put('/zones/' + selectedZone + '/sso-config', payload);

      toast.success(t("zoneSso.saveSuccess"));
      await fetchZoneConfig(selectedZone);
    } catch (error) {
      console.error("Error saving zone SSO config:", error);
      toast.error(t("zoneSso.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const selectedZoneData = zones.find(z => z.id === selectedZone);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t("zoneSso.title")}
        </CardTitle>
        <CardDescription>
          {t("zoneSso.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t("zoneSso.helpText")}
          </AlertDescription>
        </Alert>

        {/* Zone Selector */}
        <div className="space-y-2">
          <Label>{t("zoneSso.selectZone")}</Label>
          <Select value={selectedZone} onValueChange={setSelectedZone}>
            <SelectTrigger>
              <SelectValue placeholder={t("zoneSso.selectZonePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {zones.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.code} - {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedZone && (
          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">
              {t("zoneSso.configuringZone")}: <span className="text-foreground">{selectedZoneData?.code} - {selectedZoneData?.name}</span>
            </div>

            {/* Admin Group */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-destructive" />
                {t("zoneSso.adminGroup")}
              </Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={adminGroupId}
                onChange={(e) => setAdminGroupId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("zoneSso.adminGroupDesc")}
              </p>
            </div>

            {/* Operator Group */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {t("zoneSso.operatorGroup")}
              </Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={operatorGroupId}
                onChange={(e) => setOperatorGroupId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("zoneSso.operatorGroupDesc")}
              </p>
            </div>

            {/* Viewer Group */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                {t("zoneSso.viewerGroup")}
              </Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={viewerGroupId}
                onChange={(e) => setViewerGroupId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("zoneSso.viewerGroupDesc")}
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? t("common.loading") : t("zoneSso.save")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
