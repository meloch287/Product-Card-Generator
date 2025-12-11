import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Link2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';

const API_BASE = '';

interface ImportPreviewRow {
  row_number: number;
  article: string;
  name: string;
  brand: string;
  price: number;
  photos_count: number;
  is_valid: boolean;
  errors: string[];
  exists: boolean;
}

interface ImportPreviewResponse {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  existing_rows: number;
  new_rows: number;
  columns: string[];
  rows: ImportPreviewRow[];
  detected_mapping: Record<string, string>;
}

interface ImportResultRow {
  row_number: number;
  article: string;
  name: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string;
  card_id?: string;
}

interface ImportResponse {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: ImportResultRow[];
}


interface ColumnMapping {
  article: string;
  name: string;
  brand: string;
  description: string;
  price: string;
  old_price: string;
  barcode: string;
  photos: string;
  length: string;
  width: string;
  height: string;
  weight: string;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'mapping' | 'importing' | 'results';

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [results, setResults] = useState<ImportResponse | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  
  // Settings
  const [marketplace, setMarketplace] = useState<'wildberries' | 'ozon'>('wildberries');
  const [updateExisting, setUpdateExisting] = useState(true);
  const [downloadPhotos, setDownloadPhotos] = useState(true);
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState('');
  
  // Column mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    article: '',
    name: '',
    brand: '',
    description: '',
    price: '',
    old_price: '',
    barcode: '',
    photos: '',
    length: '',
    width: '',
    height: '',
    weight: '',
  });
  
  // Row selection
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [importAll, setImportAll] = useState(true);  // Import all valid rows by default

  const resetState = () => {
    setStep('upload');
    setPreview(null);
    setResults(null);
    setImportProgress(0);
    setGoogleSheetsUrl('');
    setSelectedRows(new Set());
    setImportAll(true);
  };
  
  // Get valid rows that can be selected
  const validRows = preview?.rows.filter(r => r.is_valid) || [];
  const selectedCount = selectedRows.size;
  const allValidSelected = validRows.length > 0 && validRows.every(r => selectedRows.has(r.row_number));
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(validRows.map(r => r.row_number)));
    } else {
      setSelectedRows(new Set());
    }
  };
  
  const handleSelectRow = (rowNumber: number, checked: boolean) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(rowNumber);
      } else {
        newSet.delete(rowNumber);
      }
      return newSet;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/import/preview`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const data: ImportPreviewResponse = await res.json();
      setPreview(data);
      
      // Apply detected mapping
      setMapping(prev => ({
        ...prev,
        ...data.detected_mapping,
      }));
      
      // Auto-select all valid rows
      const validRowNumbers = data.rows.filter(r => r.is_valid).map(r => r.row_number);
      setSelectedRows(new Set(validRowNumbers));
      
      setStep('preview');
      toast.success(`Загружено ${data.total_rows} строк`);
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSheetsUpload = async () => {
    if (!googleSheetsUrl) {
      toast.error('Введите ссылку на Google Sheets');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/import/preview-google-sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleSheetsUrl }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const data: ImportPreviewResponse = await res.json();
      setPreview(data);
      
      setMapping(prev => ({
        ...prev,
        ...data.detected_mapping,
      }));
      
      // Auto-select all valid rows
      const validRowNumbers = data.rows.filter(r => r.is_valid).map(r => r.row_number);
      setSelectedRows(new Set(validRowNumbers));
      
      setStep('preview');
      toast.success(`Загружено ${data.total_rows} строк`);
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!preview) return;

    setStep('importing');
    setLoading(true);
    setImportProgress(0);

    try {
      // Use SSE endpoint for real progress
      const res = await fetch(`${API_BASE}/api/import/execute-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: '',  // Backend will find latest
          mapping,
          marketplace,
          update_existing: updateExisting,
          download_photos: downloadPhotos,
          selected_rows: importAll ? null : Array.from(selectedRows),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Import failed');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setImportProgress(data.percent);
              } else if (data.type === 'complete') {
                setImportProgress(100);
                setResults({
                  total: data.total,
                  created: data.created,
                  updated: data.updated,
                  skipped: data.skipped,
                  errors: data.errors,
                  results: data.results,
                });
                setStep('results');
                toast.success(`Импорт завершен: создано ${data.created}, обновлено ${data.updated}`);
                onImported?.();
              } else if (data.type === 'error' || data.error) {
                throw new Error(data.error || 'Import failed');
              }
            } catch (parseError) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (e: any) {
      toast.error(`Ошибка импорта: ${e.message}`);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    window.open(`${API_BASE}/api/import/template`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetState();
      onOpenChange(open);
    }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Импорт товаров из Excel
          </DialogTitle>
          <DialogDescription>
            Загрузите Excel файл или укажите ссылку на Google Sheets с данными товаров
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <Tabs defaultValue="file" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="file" className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel файл
                  </TabsTrigger>
                  <TabsTrigger value="google" className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Google Sheets
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="space-y-4 mt-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-2">Загрузите Excel файл</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Поддерживаются форматы .xlsx и .xls
                    </p>
                    <Input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      disabled={loading}
                      className="max-w-xs mx-auto"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="google" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Ссылка на Google Sheets</Label>
                      <Input
                        value={googleSheetsUrl}
                        onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Убедитесь, что доступ к таблице открыт для всех по ссылке
                      </p>
                    </div>
                    <Button
                      onClick={handleGoogleSheetsUpload}
                      disabled={loading || !googleSheetsUrl}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4 mr-2" />
                      )}
                      Загрузить из Google Sheets
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Скачать шаблон
                </Button>
                <p className="text-sm text-muted-foreground">
                  Формат: Строка 1 - группы, Строка 2 - заголовки, Строка 3 - подсказки, Строка 4+ - данные
                </p>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">{preview.total_rows}</div>
                  <div className="text-sm text-muted-foreground">Всего строк</div>
                </div>
                <div className="bg-green-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-500">{preview.new_rows}</div>
                  <div className="text-sm text-muted-foreground">Новых</div>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-500">{preview.existing_rows}</div>
                  <div className="text-sm text-muted-foreground">Обновить</div>
                </div>
                <div className="bg-red-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-500">{preview.invalid_rows}</div>
                  <div className="text-sm text-muted-foreground">Ошибок</div>
                </div>
              </div>

              {/* Settings */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-2">
                  <Label>Маркетплейс</Label>
                  <Select value={marketplace} onValueChange={(v) => setMarketplace(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wildberries">Wildberries</SelectItem>
                      <SelectItem value="ozon">Ozon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="updateExisting"
                      checked={updateExisting}
                      onCheckedChange={(c) => setUpdateExisting(!!c)}
                    />
                    <Label htmlFor="updateExisting">Обновлять существующие товары</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="downloadPhotos"
                      checked={downloadPhotos}
                      onCheckedChange={(c) => setDownloadPhotos(!!c)}
                    />
                    <Label htmlFor="downloadPhotos">Скачивать фото по ссылкам</Label>
                  </div>
                </div>
              </div>

              {/* Selection controls */}
              <div className="flex items-center gap-4 p-2 bg-muted/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="importAll"
                    checked={importAll}
                    onCheckedChange={(c) => setImportAll(!!c)}
                  />
                  <Label htmlFor="importAll" className="text-sm cursor-pointer">
                    Импортировать все ({preview.valid_rows} валидных)
                  </Label>
                </div>
                {!importAll && (
                  <>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="selectAll"
                        checked={allValidSelected}
                        onCheckedChange={handleSelectAll}
                      />
                      <Label htmlFor="selectAll" className="text-sm cursor-pointer">
                        Выбрать все из превью
                      </Label>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Выбрано: <span className="font-medium text-foreground">{selectedCount}</span> из {validRows.length}
                    </div>
                  </>
                )}
              </div>

              {/* Preview Table */}
              <ScrollArea className="h-[280px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>Артикул</TableHead>
                      <TableHead>Наименование</TableHead>
                      <TableHead>Бренд</TableHead>
                      <TableHead>Цена</TableHead>
                      <TableHead>Фото</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow 
                        key={row.row_number}
                        className={selectedRows.has(row.row_number) ? 'bg-primary/5' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedRows.has(row.row_number)}
                            onCheckedChange={(checked) => handleSelectRow(row.row_number, !!checked)}
                            disabled={!row.is_valid}
                          />
                        </TableCell>
                        <TableCell>{row.row_number}</TableCell>
                        <TableCell className="font-mono text-sm">{row.article}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{row.name}</TableCell>
                        <TableCell>{row.brand}</TableCell>
                        <TableCell>{row.price > 0 ? `${row.price} ₽` : '-'}</TableCell>
                        <TableCell>
                          {row.photos_count > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <ImageIcon className="h-3 w-3 mr-1" />
                              {row.photos_count}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!row.is_valid ? (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="h-3 w-3 mr-1" />
                              Ошибка
                            </Badge>
                          ) : row.exists ? (
                            <Badge variant="secondary" className="text-xs">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Обновить
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-green-500">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Новый
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {preview.total_rows > 100 && (
                <p className="text-sm text-muted-foreground text-center">
                  Показаны первые 100 строк из {preview.total_rows}
                </p>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <h3 className="text-lg font-medium mb-2">Импорт товаров...</h3>
              <p className="text-muted-foreground mb-4">Пожалуйста, подождите</p>
              <Progress value={importProgress} className="w-64" />
              <p className="text-sm text-muted-foreground mt-2">{importProgress}%</p>
            </div>
          )}

          {/* Step: Results */}
          {step === 'results' && results && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-green-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-500">{results.created}</div>
                  <div className="text-sm text-muted-foreground">Создано</div>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-500">{results.updated}</div>
                  <div className="text-sm text-muted-foreground">Обновлено</div>
                </div>
                <div className="bg-yellow-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-500">{results.skipped}</div>
                  <div className="text-sm text-muted-foreground">Пропущено</div>
                </div>
                <div className="bg-red-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-500">{results.errors}</div>
                  <div className="text-sm text-muted-foreground">Ошибок</div>
                </div>
              </div>

              {/* Results Table */}
              <ScrollArea className="h-[300px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>Артикул</TableHead>
                      <TableHead>Наименование</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Сообщение</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.results.map((row) => (
                      <TableRow key={row.row_number}>
                        <TableCell>{row.row_number}</TableCell>
                        <TableCell className="font-mono text-sm">{row.article}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{row.name}</TableCell>
                        <TableCell>
                          {row.status === 'created' && (
                            <Badge className="bg-green-500 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Создан
                            </Badge>
                          )}
                          {row.status === 'updated' && (
                            <Badge variant="secondary" className="text-xs">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Обновлен
                            </Badge>
                          )}
                          {row.status === 'skipped' && (
                            <Badge variant="outline" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Пропущен
                            </Badge>
                          )}
                          {row.status === 'error' && (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="h-3 w-3 mr-1" />
                              Ошибка
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.message}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={resetState}>
                Назад
              </Button>
              <Button
                onClick={handleExecuteImport}
                disabled={loading || !preview || (!importAll && selectedCount === 0)}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Импортировать {importAll ? preview.valid_rows : selectedCount} товаров
              </Button>
            </>
          )}
          
          {step === 'results' && (
            <>
              <Button variant="outline" onClick={resetState}>
                Импортировать еще
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                Готово
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
