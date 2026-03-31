import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, Trash2, Plus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

const CHUNK_SIZE = 5000; // Lines per chunk

interface ImportStats {
  totalLines: number;
  filtered: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  byWorkgroup: Record<string, number>;
  deletedAccounts: string[];
  error?: string;
}

interface ImportResult {
  success: boolean;
  stats: ImportStats;
  importDate: string;
  mode: string;
  error?: string;
}

interface ChunkProgress {
  current: number;
  total: number;
  status: string;
}

const ImportPasswordFailures = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<"diff" | "replace">("diff");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null);
  
  const abortRef = useRef(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      setFile(droppedFile);
    } else {
      toast({
        title: t('importPasswordFailures.invalidFile'),
        description: t('importPasswordFailures.csvOnly'),
        variant: "destructive"
      });
    }
  }, [toast, t]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  // Upload a single chunk to the REST API
  const uploadChunk = async (
    chunkBlob: Blob,
    chunkIndex: number,
    totalChunks: number,
    importMode: string,
    jobId: string | null
  ): Promise<{ success: boolean; jobId: string; stats?: Partial<ImportStats>; error?: string }> => {
    const formData = new FormData();
    formData.append('file', chunkBlob, 'chunk.csv');
    formData.append('mode', importMode);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    if (jobId) {
      formData.append('jobId', jobId);
    }

    return await api.upload<{ success: boolean; jobId: string; stats?: Partial<ImportStats>; error?: string }>(
      '/password-failures/import',
      formData
    );
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setLastResult(null);
    setChunkProgress(null);
    abortRef.current = false;

    try {
      // Read file as text
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      
      if (lines.length < 2) {
        throw new Error(t('importPasswordFailures.emptyFile'));
      }

      const header = lines[0];
      const dataLines = lines.slice(1).filter(l => l.trim());
      
      console.log(`[ImportPasswordFailures] File has ${dataLines.length} data lines`);

      // Calculate chunks
      const totalChunks = Math.ceil(dataLines.length / CHUNK_SIZE);
      
      setChunkProgress({ current: 0, total: totalChunks, status: 'starting' });

      let jobId: string | null = null;
      let aggregatedStats: ImportStats = {
        totalLines: 0,
        filtered: 0,
        inserted: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        byWorkgroup: {},
        deletedAccounts: []
      };

      // Process chunks sequentially
      for (let i = 0; i < totalChunks; i++) {
        if (abortRef.current) {
          throw new Error('Import cancelled');
        }

        const startIdx = i * CHUNK_SIZE;
        const endIdx = Math.min((i + 1) * CHUNK_SIZE, dataLines.length);
        const chunkLines = dataLines.slice(startIdx, endIdx);
        
        // Create chunk CSV with header
        const chunkCSV = [header, ...chunkLines].join('\n');
        const chunkBlob = new Blob([chunkCSV], { type: 'text/csv' });
        
        console.log(`[ImportPasswordFailures] Uploading chunk ${i + 1}/${totalChunks} (${chunkLines.length} lines)`);
        
        setChunkProgress({ 
          current: i, 
          total: totalChunks, 
          status: `Chunk ${i + 1}/${totalChunks}` 
        });

        // Upload chunk
        const result = await uploadChunk(chunkBlob, i + 1, totalChunks, mode, jobId);
        
        if (!result.success) {
          throw new Error(result.error || 'Chunk upload failed');
        }

        // Store jobId from first chunk
        if (!jobId && result.jobId) {
          jobId = result.jobId;
        }

        // Aggregate stats
        if (result.stats) {
          aggregatedStats.totalLines += result.stats.totalLines || 0;
          aggregatedStats.filtered += result.stats.filtered || 0;
          aggregatedStats.inserted += result.stats.inserted || 0;
          aggregatedStats.skipped += result.stats.skipped || 0;
          aggregatedStats.deleted = result.stats.deleted || 0;
          aggregatedStats.deletedAccounts = result.stats.deletedAccounts || [];
          
          // Merge byWorkgroup
          if (result.stats.byWorkgroup) {
            for (const [wg, count] of Object.entries(result.stats.byWorkgroup)) {
              aggregatedStats.byWorkgroup[wg] = (aggregatedStats.byWorkgroup[wg] || 0) + count;
            }
          }
        }

        setChunkProgress({ 
          current: i + 1, 
          total: totalChunks, 
          status: `Chunk ${i + 1}/${totalChunks} completed` 
        });
      }

      // Import completed
      setLastResult({
        success: true,
        stats: aggregatedStats,
        importDate: new Date().toISOString(),
        mode
      });

      toast({
        title: t('importPasswordFailures.success'),
        description: t('importPasswordFailures.successDesc', { 
          inserted: aggregatedStats.inserted,
          updated: aggregatedStats.updated,
          deleted: aggregatedStats.deleted
        })
      });

      setFile(null);

    } catch (error) {
      console.error('Import error:', error);
      
      setLastResult({
        success: false,
        stats: {
          totalLines: 0,
          filtered: 0,
          inserted: 0,
          updated: 0,
          deleted: 0,
          skipped: 0,
          byWorkgroup: {},
          deletedAccounts: []
        },
        importDate: new Date().toISOString(),
        mode,
        error: error instanceof Error ? error.message : t('importPasswordFailures.unknownError')
      });

      toast({
        title: t('importPasswordFailures.error'),
        description: error instanceof Error ? error.message : t('importPasswordFailures.unknownError'),
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
      setChunkProgress(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const progressPercentage = chunkProgress 
    ? Math.round((chunkProgress.current / chunkProgress.total) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('importPasswordFailures.title')}</h2>
        <p className="text-muted-foreground">{t('importPasswordFailures.subtitle')}</p>
      </div>

      {/* Progress indicator when processing */}
      {isImporting && chunkProgress && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              {t('importPasswordFailures.processing')}
            </CardTitle>
            <CardDescription>
              {chunkProgress.status}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progressPercentage} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                {chunkProgress.current} / {chunkProgress.total} chunks
              </span>
              <span>{progressPercentage}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('importPasswordFailures.modeTitle')}</CardTitle>
          <CardDescription>{t('importPasswordFailures.modeDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "diff" | "replace")} disabled={isImporting}>
            <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="diff" id="diff" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="diff" className="font-medium cursor-pointer">
                  {t('importPasswordFailures.modeDiff')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('importPasswordFailures.modeDiffDesc')}
                </p>
              </div>
              <Badge variant="secondary">{t('importPasswordFailures.recommended')}</Badge>
            </div>
            
            <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="replace" id="replace" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="replace" className="font-medium cursor-pointer">
                  {t('importPasswordFailures.modeReplace')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('importPasswordFailures.modeReplaceDesc')}
                </p>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('importPasswordFailures.uploadTitle')}</CardTitle>
          <CardDescription>{t('importPasswordFailures.uploadDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
              ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
              ${file ? 'border-primary bg-primary/5' : ''}
              ${isImporting ? 'pointer-events-none opacity-50' : ''}
            `}
            onClick={() => !isImporting && document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isImporting}
            />
            
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-12 w-12 text-primary" />
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {!isImporting && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    {t('importPasswordFailures.changeFile')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-12 w-12 text-muted-foreground" />
                <p className="font-medium">{t('importPasswordFailures.dropHere')}</p>
                <p className="text-sm text-muted-foreground">{t('importPasswordFailures.orClick')}</p>
              </div>
            )}
          </div>

          {/* Required columns info */}
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertTitle>{t('importPasswordFailures.requiredColumns')}</AlertTitle>
            <AlertDescription className="text-sm">
              <code className="text-xs bg-muted px-1 py-0.5 rounded">AccountName</code>,{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">Result</code>,{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">AutoManagementFlag</code>,{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">WorkgroupName</code>
              <br />
              <span className="text-muted-foreground mt-1 block">
                {t('importPasswordFailures.optionalColumns')}:{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">DomainName</code>,{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">AssetName</code>,{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">PlatformName</code>,{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">LastChangeDate</code>
              </span>
            </AlertDescription>
          </Alert>

          <Button 
            onClick={handleImport} 
            disabled={!file || isImporting}
            className="w-full"
            size="lg"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {chunkProgress 
                  ? t('importPasswordFailures.processingProgress', { percent: progressPercentage }) 
                  : t('importPasswordFailures.importing')}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {t('importPasswordFailures.import')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {lastResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              {t('importPasswordFailures.resultTitle')}
            </CardTitle>
            <CardDescription>
              {formatDate(lastResult.importDate)} • {t(`importPasswordFailures.mode${lastResult.mode === 'diff' ? 'Diff' : 'Replace'}`)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lastResult.success ? (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-green-500/10 rounded-lg text-center">
                    <Plus className="h-5 w-5 mx-auto mb-1 text-green-500" />
                    <p className="text-2xl font-bold text-green-600">{lastResult.stats.inserted}</p>
                    <p className="text-sm text-muted-foreground">{t('importPasswordFailures.inserted')}</p>
                  </div>
                  <div className="p-4 bg-blue-500/10 rounded-lg text-center">
                    <RefreshCw className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                    <p className="text-2xl font-bold text-blue-600">{lastResult.stats.updated}</p>
                    <p className="text-sm text-muted-foreground">{t('importPasswordFailures.updated')}</p>
                  </div>
                  <div className="p-4 bg-orange-500/10 rounded-lg text-center">
                    <Trash2 className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                    <p className="text-2xl font-bold text-orange-600">{lastResult.stats.deleted}</p>
                    <p className="text-sm text-muted-foreground">{t('importPasswordFailures.deleted')}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <FileSpreadsheet className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{lastResult.stats.skipped}</p>
                    <p className="text-sm text-muted-foreground">{t('importPasswordFailures.skipped')}</p>
                  </div>
                </div>

                {/* By Workgroup */}
                {Object.keys(lastResult.stats.byWorkgroup || {}).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">{t('importPasswordFailures.byWorkgroup')}</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('importPasswordFailures.workgroup')}</TableHead>
                          <TableHead className="text-right">{t('importPasswordFailures.count')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(lastResult.stats.byWorkgroup)
                          .sort(([, a], [, b]) => b - a)
                          .map(([workgroup, count]) => (
                            <TableRow key={workgroup}>
                              <TableCell className="font-medium">{workgroup}</TableCell>
                              <TableCell className="text-right">{count}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Diff cleanup error */}
                {lastResult.stats.error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('importPasswordFailures.diffCleanupError')}</AlertTitle>
                    <AlertDescription className="text-sm whitespace-pre-wrap">
                      {lastResult.stats.error}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Deleted accounts warning */}
                {lastResult.stats.deletedAccounts?.length > 0 && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>{t('importPasswordFailures.resolvedTitle')}</AlertTitle>
                    <AlertDescription>
                      {t('importPasswordFailures.resolvedDesc', { count: lastResult.stats.deleted })}
                      <ul className="mt-2 text-sm list-disc list-inside max-h-32 overflow-y-auto">
                        {lastResult.stats.deletedAccounts.slice(0, 10).map((account, i) => (
                          <li key={i} className="text-muted-foreground">{account}</li>
                        ))}
                        {lastResult.stats.deletedAccounts.length > 10 && (
                          <li className="text-muted-foreground">
                            {t('importPasswordFailures.andMore', { count: lastResult.stats.deletedAccounts.length - 10 })}
                          </li>
                        )}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('importPasswordFailures.errorTitle')}</AlertTitle>
                <AlertDescription>{lastResult.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Warning about import behavior */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t('importPasswordFailures.warningTitle')}</AlertTitle>
        <AlertDescription>
          {t('importPasswordFailures.warningDesc')}
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default ImportPasswordFailures;
