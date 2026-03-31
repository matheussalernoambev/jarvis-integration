import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { 
  Loader2, Users, Info, Shield, UserCog, Eye, 
  ChevronDown, ChevronUp, ExternalLink, Lightbulb,
  Copy, CheckCircle2, Circle
} from "lucide-react";
import { useTranslation } from "react-i18next";

export function AzureGroupMappingCard() {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [adminGroupId, setAdminGroupId] = useState("");
  const [operatorGroupId, setOperatorGroupId] = useState("");
  const [viewerGroupId, setViewerGroupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Validation helpers
  const isValidGuid = (value: string) => 
    !value || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const isMaskedValue = (value: string) => 
    value.includes('••••') || value.includes('(verify vault)');

  useEffect(() => {
    loadExistingConfig();
  }, []);

  const loadExistingConfig = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ admin: string | null; operator: string | null; viewer: string | null }>('/credentials/azure-groups');

      const hasAdmin = !!data.admin;
      const hasOperator = !!data.operator;
      const hasViewer = !!data.viewer;

      if (hasAdmin || hasOperator || hasViewer) {
        setConfigured(true);
        // Show masked values for configured groups
        if (hasAdmin) setAdminGroupId("••••••••-••••-••••-••••-••••••••••••");
        if (hasOperator) setOperatorGroupId("••••••••-••••-••••-••••-••••••••••••");
        if (hasViewer) setViewerGroupId("••••••••-••••-••••-••••-••••••••••••");
      }
    } catch (error) {
      console.error('Error loading group config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate all non-empty fields are valid GUIDs
    if (adminGroupId && !isMaskedValue(adminGroupId) && !isValidGuid(adminGroupId)) {
      toast({
        title: t('common.error'),
        description: t('globalSettings.sso.groupMapping.invalidGuid'),
        variant: "destructive",
      });
      return;
    }

    if (operatorGroupId && !isMaskedValue(operatorGroupId) && !isValidGuid(operatorGroupId)) {
      toast({
        title: t('common.error'),
        description: t('globalSettings.sso.groupMapping.invalidGuid'),
        variant: "destructive",
      });
      return;
    }

    if (viewerGroupId && !isMaskedValue(viewerGroupId) && !isValidGuid(viewerGroupId)) {
      toast({
        title: t('common.error'),
        description: t('globalSettings.sso.groupMapping.invalidGuid'),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Build credentials with only non-masked values
      const credentials: Record<string, string> = {};
      if (adminGroupId && !isMaskedValue(adminGroupId)) credentials.admin = adminGroupId;
      if (operatorGroupId && !isMaskedValue(operatorGroupId)) credentials.operator = operatorGroupId;
      if (viewerGroupId && !isMaskedValue(viewerGroupId)) credentials.viewer = viewerGroupId;

      if (Object.keys(credentials).length > 0) {
        await api.post('/credentials/save', { provider: 'azure_groups', credentials });
      }

      toast({
        title: t('common.success'),
        description: t('globalSettings.sso.groupMapping.saveSuccess'),
      });

      setConfigured(true);
      // Reload to show masked values
      loadExistingConfig();
    } catch (error: any) {
      console.error('Error saving group mapping:', error);
      toast({
        title: t('common.error'),
        description: error.message || t('globalSettings.sso.groupMapping.saveError'),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setAdminGroupId("");
    setOperatorGroupId("");
    setViewerGroupId("");
    setConfigured(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const StepNumber = ({ num, completed = false }: { num: number; completed?: boolean }) => (
    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
      ${completed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
      {completed ? <CheckCircle2 className="h-4 w-4" /> : num}
    </div>
  );

  const PathBadge = ({ path }: { path: string }) => (
    <Badge variant="secondary" className="font-mono text-xs mt-1 flex items-center gap-1">
      {path}
      <ExternalLink className="h-3 w-3" />
    </Badge>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('globalSettings.sso.groupMapping.title')}
            </CardTitle>
            <CardDescription>{t('globalSettings.sso.groupMapping.description')}</CardDescription>
          </div>
          {configured && (
            <Button variant="outline" size="sm" onClick={handleEdit}>
              {t('common.edit')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t('globalSettings.sso.groupMapping.info')}
          </AlertDescription>
        </Alert>

        {/* Collapsible Setup Guide */}
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                {t('globalSettings.sso.groupMapping.setupGuide.title')}
              </span>
              {guideOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="border rounded-lg p-4 space-y-5 bg-muted/30">
              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <StepNumber num={1} />
                  <div className="flex-1">
                    <p className="font-medium">{t('globalSettings.sso.groupMapping.setupGuide.step1Title')}</p>
                    <p className="text-sm text-muted-foreground">{t('globalSettings.sso.groupMapping.setupGuide.step1Desc')}</p>
                    <PathBadge path={t('globalSettings.sso.groupMapping.setupGuide.step1Path')} />
                    <p className="text-sm mt-2">{t('globalSettings.sso.groupMapping.setupGuide.step1Options')}</p>
                    <ul className="mt-1 space-y-1 ml-4">
                      <li className="flex items-start gap-2 text-sm">
                        <Circle className="h-3 w-3 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong>{t('globalSettings.sso.groupMapping.setupGuide.step1Option1')}</strong>
                          <span className="text-muted-foreground"> - {t('globalSettings.sso.groupMapping.setupGuide.step1Option1Desc')}</span>
                        </span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <Circle className="h-3 w-3 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong>{t('globalSettings.sso.groupMapping.setupGuide.step1Option2')}</strong>
                          <span className="text-muted-foreground"> - {t('globalSettings.sso.groupMapping.setupGuide.step1Option2Desc')}</span>
                        </span>
                      </li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      {t('globalSettings.sso.groupMapping.setupGuide.step1Note')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <StepNumber num={2} />
                  <div className="flex-1">
                    <p className="font-medium">{t('globalSettings.sso.groupMapping.setupGuide.step2Title')}</p>
                    <p className="text-sm text-muted-foreground">{t('globalSettings.sso.groupMapping.setupGuide.step2Desc')}</p>
                    <PathBadge path={t('globalSettings.sso.groupMapping.setupGuide.step2Path')} />
                    <p className="text-sm mt-2">{t('globalSettings.sso.groupMapping.setupGuide.step2Action')}</p>
                    <ul className="mt-1 space-y-0.5 ml-4">
                      <li className="text-sm font-mono text-muted-foreground">• {t('globalSettings.sso.groupMapping.setupGuide.step2Example1')}</li>
                      <li className="text-sm font-mono text-muted-foreground">• {t('globalSettings.sso.groupMapping.setupGuide.step2Example2')}</li>
                      <li className="text-sm font-mono text-muted-foreground">• {t('globalSettings.sso.groupMapping.setupGuide.step2Example3')}</li>
                    </ul>
                    <p className="text-sm mt-2 flex items-center gap-1">
                      <Copy className="h-3 w-3" />
                      {t('globalSettings.sso.groupMapping.setupGuide.step2Copy')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <StepNumber num={3} />
                  <div className="flex-1">
                    <p className="font-medium">{t('globalSettings.sso.groupMapping.setupGuide.step3Title')}</p>
                    <p className="text-sm text-muted-foreground">{t('globalSettings.sso.groupMapping.setupGuide.step3Desc')}</p>
                    <PathBadge path={t('globalSettings.sso.groupMapping.setupGuide.step3Path')} />
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <StepNumber num={4} />
                  <div className="flex-1">
                    <p className="font-medium text-amber-600 dark:text-amber-500">
                      {t('globalSettings.sso.groupMapping.setupGuide.step4Title')}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('globalSettings.sso.groupMapping.setupGuide.step4Desc')}</p>
                    <PathBadge path={t('globalSettings.sso.groupMapping.setupGuide.step4Path')} />
                    <p className="text-sm mt-2">{t('globalSettings.sso.groupMapping.setupGuide.step4Action')}</p>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Where to find hint */}
        <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
          <Lightbulb className="h-4 w-4 mt-0.5 text-amber-500" />
          <div className="text-sm">
            <span className="font-medium">{t('globalSettings.sso.groupMapping.whereToFind')}: </span>
            <span className="text-muted-foreground">{t('globalSettings.sso.groupMapping.whereToFindDesc')}</span>
          </div>
        </div>

        <div className="grid gap-4">
          {/* Admin Group */}
          <div className="space-y-2">
            <Label htmlFor="admin-group" className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-destructive" />
              {t('globalSettings.sso.groupMapping.adminGroup')}
              <span className="text-xs text-muted-foreground">(Full Access)</span>
            </Label>
            <Input
              id="admin-group"
              placeholder={t('globalSettings.sso.groupMapping.placeholder')}
              value={adminGroupId}
              onChange={(e) => setAdminGroupId(e.target.value)}
              disabled={configured}
              className={!isValidGuid(adminGroupId) && adminGroupId && !isMaskedValue(adminGroupId) ? "border-destructive" : ""}
            />
          </div>

          {/* Operator Group */}
          <div className="space-y-2">
            <Label htmlFor="operator-group" className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-warning" />
              {t('globalSettings.sso.groupMapping.operatorGroup')}
              <span className="text-xs text-muted-foreground">(Scan, Onboarding, Rules)</span>
            </Label>
            <Input
              id="operator-group"
              placeholder={t('globalSettings.sso.groupMapping.placeholder')}
              value={operatorGroupId}
              onChange={(e) => setOperatorGroupId(e.target.value)}
              disabled={configured}
              className={!isValidGuid(operatorGroupId) && operatorGroupId && !isMaskedValue(operatorGroupId) ? "border-destructive" : ""}
            />
          </div>

          {/* Viewer Group */}
          <div className="space-y-2">
            <Label htmlFor="viewer-group" className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              {t('globalSettings.sso.groupMapping.viewerGroup')}
              <span className="text-xs text-muted-foreground">(Dashboard only)</span>
            </Label>
            <Input
              id="viewer-group"
              placeholder={t('globalSettings.sso.groupMapping.placeholder')}
              value={viewerGroupId}
              onChange={(e) => setViewerGroupId(e.target.value)}
              disabled={configured}
              className={!isValidGuid(viewerGroupId) && viewerGroupId && !isMaskedValue(viewerGroupId) ? "border-destructive" : ""}
            />
          </div>
        </div>

        {!configured && (
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('globalSettings.sso.groupMapping.save')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
