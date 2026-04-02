import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Brain,
  ThumbsUp,
  ThumbsDown,
  LayoutList,
  BarChart3,
  Bell,
  Plus,
  Trash2,
  Edit3,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────

interface DevopsCard {
  id: string;
  zone_id: string;
  system_name: string;
  managed_system_id: number;
  devops_work_item_id: number | null;
  devops_url: string | null;
  title: string;
  assigned_to: string | null;
  owner1: string | null;
  owner2: string | null;
  due_date: string | null;
  ai_classification: any;
  status: string;
  error_message: string | null;
  created_at: string | null;
}

interface Analysis {
  id: string;
  zone_id: string;
  managed_account_id: number;
  error_raw: string;
  ai_diagnosis: string;
  ai_category: string;
  ai_confidence: number;
  suggested_action: string;
  suggested_platform_type: string;
  card_title: string;
  card_description: string;
  feedback_correct: boolean | null;
  feedback_note: string | null;
  analyzed_at: string | null;
}

interface Reminder {
  id: string;
  zone_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  recurrence: string;
  next_run_at: string | null;
  devops_work_item_id: number | null;
  is_active: boolean;
}

interface Zone {
  id: string;
  code: string;
  name: string;
}

interface CardStats {
  total: number;
  by_status: Record<string, number>;
}

interface AnalysisStats {
  total_analyses: number;
  by_category: Record<string, number>;
  feedback: { correct: number; incorrect: number; total: number; accuracy: number | null };
}

// ─── Component ───────────────────────────────────────────────────────────

export default function DevopsCardsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const locale = i18n.language === "pt-BR" ? ptBR : enUS;

  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Cards
  const [cards, setCards] = useState<DevopsCard[]>([]);
  const [cardStats, setCardStats] = useState<CardStats>({ total: 0, by_status: {} });

  // Analyses
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [analysisStats, setAnalysisStats] = useState<AnalysisStats>({
    total_analyses: 0,
    by_category: {},
    feedback: { correct: 0, incorrect: 0, total: 0, accuracy: null },
  });
  const [feedbackDialog, setFeedbackDialog] = useState<{ open: boolean; analysisId: string; note: string }>({
    open: false,
    analysisId: "",
    note: "",
  });

  // Reminders
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderDialog, setReminderDialog] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Partial<Reminder> | null>(null);

  // Trigger analysis
  const [analyzing, setAnalyzing] = useState(false);

  const zoneParam = selectedZone !== "all" ? `zone_id=${selectedZone}` : "";

  // ─── Fetch ─────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesData, cardsData, statsData, analysesData, aStatsData, remData] = await Promise.all([
        api.get<Zone[]>("/zones"),
        api.get<{ data: DevopsCard[]; total: number }>(`/devops-cards?limit=100&${zoneParam}`),
        api.get<CardStats>(`/devops-cards/stats?${zoneParam}`),
        api.get<{ data: Analysis[]; total: number }>(`/devops-cards/analyses?limit=100&${zoneParam}`),
        api.get<AnalysisStats>(`/devops-cards/analyses/stats?${zoneParam}`),
        api.get<Reminder[]>(`/scheduled-reminders?${zoneParam}`),
      ]);
      setZones(zonesData || []);
      setCards(cardsData?.data || []);
      setCardStats(statsData || { total: 0, by_status: {} });
      setAnalyses(analysesData?.data || []);
      setAnalysisStats(aStatsData || { total_analyses: 0, by_category: {}, feedback: { correct: 0, incorrect: 0, total: 0, accuracy: null } });
      setReminders(remData || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, [zoneParam]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const getZoneCode = (zoneId: string) => zones.find((z) => z.id === zoneId)?.code || zoneId.slice(0, 8);

  // ─── Actions ───────────────────────────────────────────────────────────

  const triggerAnalysis = async (dryRun: boolean) => {
    if (selectedZone === "all") {
      toast({ title: t("devopsCards.selectZoneFirst"), variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    try {
      const res = await api.post<any>(`/devops-cards/analyze/${selectedZone}?dry_run=${dryRun}`);
      if (res.success) {
        toast({
          title: t("devopsCards.analysisStarted"),
          description: t("devopsCards.analysisRunningBg"),
        });
      } else {
        toast({ title: res.error || t("devopsCards.analysisErrors"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("devopsCards.analysisError"), variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const retryCard = async (cardId: string) => {
    try {
      await api.post(`/devops-cards/${cardId}/retry`);
      toast({ title: t("devopsCards.retryQueued") });
      fetchAll();
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  const submitFeedback = async (analysisId: string, correct: boolean) => {
    if (!correct) {
      setFeedbackDialog({ open: true, analysisId, note: "" });
      return;
    }
    try {
      await api.post(`/devops-cards/analyses/${analysisId}/feedback`, { correct: true });
      toast({ title: t("devopsCards.feedbackSaved") });
      fetchAll();
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  const confirmNegativeFeedback = async () => {
    try {
      await api.post(`/devops-cards/analyses/${feedbackDialog.analysisId}/feedback`, {
        correct: false,
        note: feedbackDialog.note,
      });
      toast({ title: t("devopsCards.feedbackSaved") });
      setFeedbackDialog({ open: false, analysisId: "", note: "" });
      fetchAll();
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  // ─── Reminder CRUD ─────────────────────────────────────────────────────

  const openReminderDialog = (rem?: Reminder) => {
    setEditingReminder(
      rem || {
        zone_id: selectedZone !== "all" ? selectedZone : "",
        title: "",
        description: "",
        assigned_to: "",
        recurrence: "once",
        next_run_at: "",
        is_active: true,
      }
    );
    setReminderDialog(true);
  };

  const saveReminder = async () => {
    if (!editingReminder) return;
    try {
      if (editingReminder.id) {
        await api.put(`/scheduled-reminders/${editingReminder.id}`, editingReminder);
      } else {
        await api.post("/scheduled-reminders", editingReminder);
      }
      toast({ title: t("devopsCards.reminderSaved") });
      setReminderDialog(false);
      fetchAll();
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      await api.delete(`/scheduled-reminders/${id}`);
      toast({ title: t("devopsCards.reminderDeleted") });
      fetchAll();
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  // ─── Status helpers ────────────────────────────────────────────────────

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      created: { variant: "default", icon: CheckCircle2 },
      synced: { variant: "default", icon: CheckCircle2 },
      pending_retry: { variant: "secondary", icon: Clock },
      error: { variant: "destructive", icon: XCircle },
    };
    const cfg = map[status] || { variant: "outline" as const, icon: AlertCircle };
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const categoryBadge = (cat: string) => {
    const colors: Record<string, string> = {
      account_not_found: "bg-amber-500/10 text-amber-700 border-amber-200",
      access_denied: "bg-red-500/10 text-red-700 border-red-200",
      network_unreachable: "bg-blue-500/10 text-blue-700 border-blue-200",
      authentication_failed: "bg-orange-500/10 text-orange-700 border-orange-200",
      unknown: "bg-gray-500/10 text-gray-700 border-gray-200",
    };
    return (
      <Badge variant="outline" className={colors[cat] || colors.unknown}>
        {cat}
      </Badge>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{t("devopsCards.title")}</h1>
          <p className="text-muted-foreground">{t("devopsCards.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {/* Zone filter + Action */}
      <div className="flex items-center gap-4">
        <Select value={selectedZone} onValueChange={setSelectedZone}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder={t("devopsCards.filterZone")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("devopsCards.allZones")}</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z.id} value={z.id}>
                <span className="font-mono">{z.code}</span> — {z.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => triggerAnalysis(true)} disabled={analyzing || selectedZone === "all"} variant="outline">
          {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
          {t("devopsCards.dryRun")}
        </Button>
        <Button onClick={() => triggerAnalysis(false)} disabled={analyzing || selectedZone === "all"}>
          {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          {t("devopsCards.runAnalysis")}
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{t("devopsCards.totalCards")}</p>
            <p className="text-2xl font-bold">{cardStats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{t("devopsCards.totalAnalyses")}</p>
            <p className="text-2xl font-bold">{analysisStats.total_analyses}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{t("devopsCards.feedbackAccuracy")}</p>
            <p className="text-2xl font-bold">
              {analysisStats.feedback.accuracy != null ? `${analysisStats.feedback.accuracy}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{t("devopsCards.errorCards")}</p>
            <p className="text-2xl font-bold text-destructive">{cardStats.by_status?.error || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cards">
        <TabsList>
          <TabsTrigger value="cards">
            <LayoutList className="h-4 w-4 mr-2" />
            {t("devopsCards.tabCards")} ({cardStats.total})
          </TabsTrigger>
          <TabsTrigger value="analyses">
            <Brain className="h-4 w-4 mr-2" />
            {t("devopsCards.tabAnalyses")} ({analysisStats.total_analyses})
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="h-4 w-4 mr-2" />
            {t("devopsCards.tabStats")}
          </TabsTrigger>
          <TabsTrigger value="reminders">
            <Bell className="h-4 w-4 mr-2" />
            {t("devopsCards.tabReminders")} ({reminders.length})
          </TabsTrigger>
        </TabsList>

        {/* ─── Cards Tab ────────────────────────────────────────────── */}
        <TabsContent value="cards">
          <Card>
            <CardContent className="p-0">
              {cards.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">{t("devopsCards.noCards")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("devopsCards.colZone")}</TableHead>
                      <TableHead>{t("devopsCards.colSystem")}</TableHead>
                      <TableHead>{t("devopsCards.colTitle")}</TableHead>
                      <TableHead>{t("devopsCards.colAssigned")}</TableHead>
                      <TableHead>{t("devopsCards.colStatus")}</TableHead>
                      <TableHead>{t("devopsCards.colCreated")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cards.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{getZoneCode(c.zone_id)}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{c.system_name}</TableCell>
                        <TableCell className="max-w-[300px] truncate">{c.title}</TableCell>
                        <TableCell className="text-sm">{c.assigned_to || "—"}</TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale }) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {c.devops_url && (
                              <Button variant="ghost" size="icon" asChild>
                                <a href={c.devops_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {c.status === "error" && (
                              <Button variant="ghost" size="icon" onClick={() => retryCard(c.id)}>
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Analyses Tab ─────────────────────────────────────────── */}
        <TabsContent value="analyses">
          <Card>
            <CardContent className="p-0">
              {analyses.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">{t("devopsCards.noAnalyses")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("devopsCards.colZone")}</TableHead>
                      <TableHead>{t("devopsCards.colCategory")}</TableHead>
                      <TableHead>{t("devopsCards.colConfidence")}</TableHead>
                      <TableHead>{t("devopsCards.colCardTitle")}</TableHead>
                      <TableHead>{t("devopsCards.colDiagnosis")}</TableHead>
                      <TableHead>{t("devopsCards.colFeedback")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analyses.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{getZoneCode(a.zone_id)}</Badge>
                        </TableCell>
                        <TableCell>{categoryBadge(a.ai_category)}</TableCell>
                        <TableCell>
                          <span className={`font-mono ${a.ai_confidence >= 0.8 ? "text-green-600" : a.ai_confidence >= 0.5 ? "text-amber-600" : "text-red-600"}`}>
                            {(a.ai_confidence * 100).toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate">{a.card_title}</TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">{a.ai_diagnosis}</TableCell>
                        <TableCell>
                          {a.feedback_correct === true && <Badge variant="default" className="gap-1"><ThumbsUp className="h-3 w-3" /> OK</Badge>}
                          {a.feedback_correct === false && <Badge variant="destructive" className="gap-1"><ThumbsDown className="h-3 w-3" /> Wrong</Badge>}
                          {a.feedback_correct === null && <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {a.feedback_correct === null && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => submitFeedback(a.id, true)} title={t("devopsCards.correct")}>
                                  <ThumbsUp className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => submitFeedback(a.id, false)} title={t("devopsCards.incorrect")}>
                                  <ThumbsDown className="h-4 w-4 text-red-600" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Stats Tab ────────────────────────────────────────────── */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("devopsCards.statsByStatus")}</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(cardStats.by_status).length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("devopsCards.noData")}</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(cardStats.by_status).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        {statusBadge(status)}
                        <span className="font-mono font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("devopsCards.statsByCategory")}</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(analysisStats.by_category).length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("devopsCards.noData")}</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(analysisStats.by_category)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, count]) => (
                        <div key={cat} className="flex items-center justify-between">
                          {categoryBadge(cat)}
                          <span className="font-mono font-bold">{count}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("devopsCards.feedbackStats")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("devopsCards.correct")}</span>
                  <span className="font-mono text-green-600">{analysisStats.feedback.correct}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("devopsCards.incorrect")}</span>
                  <span className="font-mono text-red-600">{analysisStats.feedback.incorrect}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("devopsCards.accuracy")}</span>
                  <span className="font-mono font-bold">
                    {analysisStats.feedback.accuracy != null ? `${analysisStats.feedback.accuracy}%` : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Reminders Tab ────────────────────────────────────────── */}
        <TabsContent value="reminders">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("devopsCards.remindersTitle")}</CardTitle>
                  <CardDescription>{t("devopsCards.remindersDesc")}</CardDescription>
                </div>
                <Button size="sm" onClick={() => openReminderDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("devopsCards.addReminder")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {reminders.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">{t("devopsCards.noReminders")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("devopsCards.colZone")}</TableHead>
                      <TableHead>{t("devopsCards.colTitle")}</TableHead>
                      <TableHead>{t("devopsCards.colAssigned")}</TableHead>
                      <TableHead>{t("devopsCards.colRecurrence")}</TableHead>
                      <TableHead>{t("devopsCards.colNextRun")}</TableHead>
                      <TableHead>{t("devopsCards.colActive")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reminders.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{getZoneCode(r.zone_id)}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell className="text-sm">{r.assigned_to || "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{r.recurrence}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.next_run_at ? formatDistanceToNow(new Date(r.next_run_at), { addSuffix: true, locale }) : "—"}
                        </TableCell>
                        <TableCell>
                          {r.is_active ? (
                            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openReminderDialog(r)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteReminder(r.id)}>
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

      {/* ─── Feedback Dialog ───────────────────────────────────────────── */}
      <Dialog open={feedbackDialog.open} onOpenChange={(v) => setFeedbackDialog({ ...feedbackDialog, open: v })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("devopsCards.feedbackTitle")}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t("devopsCards.feedbackNote")}</Label>
            <Textarea
              value={feedbackDialog.note}
              onChange={(e) => setFeedbackDialog({ ...feedbackDialog, note: e.target.value })}
              placeholder={t("devopsCards.feedbackPlaceholder")}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackDialog({ ...feedbackDialog, open: false })}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={confirmNegativeFeedback}>
              <ThumbsDown className="mr-2 h-4 w-4" />
              {t("devopsCards.confirmIncorrect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reminder Dialog ───────────────────────────────────────────── */}
      <Dialog open={reminderDialog} onOpenChange={setReminderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingReminder?.id ? t("devopsCards.editReminder") : t("devopsCards.addReminder")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedZone === "all" && (
              <div>
                <Label>{t("devopsCards.colZone")}</Label>
                <Select
                  value={editingReminder?.zone_id || ""}
                  onValueChange={(v) => setEditingReminder({ ...editingReminder, zone_id: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>{z.code} — {z.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{t("devopsCards.colTitle")}</Label>
              <Input
                value={editingReminder?.title || ""}
                onChange={(e) => setEditingReminder({ ...editingReminder, title: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("devopsCards.reminderDescription")}</Label>
              <Textarea
                value={editingReminder?.description || ""}
                onChange={(e) => setEditingReminder({ ...editingReminder, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("devopsCards.colAssigned")}</Label>
                <Input
                  value={editingReminder?.assigned_to || ""}
                  onChange={(e) => setEditingReminder({ ...editingReminder, assigned_to: e.target.value })}
                  placeholder="email@company.com"
                />
              </div>
              <div>
                <Label>{t("devopsCards.colRecurrence")}</Label>
                <Select
                  value={editingReminder?.recurrence || "once"}
                  onValueChange={(v) => setEditingReminder({ ...editingReminder, recurrence: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("devopsCards.colNextRun")}</Label>
              <Input
                type="datetime-local"
                value={editingReminder?.next_run_at?.replace("Z", "").slice(0, 16) || ""}
                onChange={(e) => setEditingReminder({ ...editingReminder, next_run_at: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveReminder}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
