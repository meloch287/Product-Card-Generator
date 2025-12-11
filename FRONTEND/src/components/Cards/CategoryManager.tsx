import { useState, useEffect } from 'react';
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
import { toast } from 'sonner';
import { 
  Upload, 
  Trash2, 
  FileSpreadsheet, 
  Loader2,
  FolderPlus,
  Eye,
  Link2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const API_BASE = 'http://localhost:8000';

interface CategoryCharacteristic {
  id: string;
  name: string;
  group: string;
  description: string;
  type: string;
  required: boolean;
  max_values: number;
  unit?: string;
  values: string[];
}

interface CategoryTemplate {
  id: string;
  name: string;
  marketplace: string;
  characteristics: CategoryCharacteristic[];
  created_at: string;
}

interface CategoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTemplateSelect?: (template: CategoryTemplate) => void;
}

export function CategoryManager({ open, onOpenChange, onTemplateSelect }: CategoryManagerProps) {
  const [templates, setTemplates] = useState<CategoryTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<CategoryTemplate | null>(null);
  
  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadMarketplace, setUploadMarketplace] = useState<'wildberries' | 'ozon'>('wildberries');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState('');

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/categories/templates`);
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(data);
    } catch (e: any) {
      toast.error(`Ошибка загрузки: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-fill name from filename
      if (!uploadName) {
        const name = file.name.replace(/\.(xlsx|xls)$/i, '');
        setUploadName(name);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadName) {
      toast.error('Выберите файл и введите название');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', uploadName);
      formData.append('marketplace', uploadMarketplace);

      const res = await fetch(`${API_BASE}/api/categories/templates`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Upload failed');
      }

      toast.success('Категория загружена');
      setSelectedFile(null);
      setUploadName('');
      loadTemplates();
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleGoogleSheetsUpload = async () => {
    if (!googleSheetsUrl || !uploadName) {
      toast.error('Введите ссылку на Google Sheets и название');
      return;
    }

    // Validate URL
    if (!googleSheetsUrl.includes('docs.google.com/spreadsheets')) {
      toast.error('Неверная ссылка на Google Sheets');
      return;
    }

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/api/categories/templates/google-sheets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: googleSheetsUrl,
          name: uploadName,
          marketplace: uploadMarketplace,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Upload failed');
      }

      toast.success('Категория загружена из Google Sheets');
      setGoogleSheetsUrl('');
      setUploadName('');
      loadTemplates();
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/categories/templates/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Категория удалена');
      loadTemplates();
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    }
  };

  const handleSelect = (template: CategoryTemplate) => {
    onTemplateSelect?.(template);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Управление категориями
            </DialogTitle>
            <DialogDescription>
              Загрузите Excel файл с характеристиками категории из WB или Ozon
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            {/* Upload Section */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h3 className="font-medium flex items-center gap-2">
                <FolderPlus className="h-4 w-4" />
                Загрузить новую категорию
              </h3>
              
              {/* Common fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Название категории</Label>
                  <Input
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="Например: Коврики для мыши"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Маркетплейс</Label>
                  <Select
                    value={uploadMarketplace}
                    onValueChange={(v) => setUploadMarketplace(v as 'wildberries' | 'ozon')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wildberries">Wildberries</SelectItem>
                      <SelectItem value="ozon">Ozon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Source tabs */}
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
                
                <TabsContent value="file" className="space-y-3 mt-3">
                  <div className="space-y-2">
                    <Label>Выберите Excel файл</Label>
                    <Input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileSelect}
                    />
                  </div>
                  
                  {selectedFile && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Выбран: {selectedFile.name}
                      </span>
                      <Button onClick={handleUpload} disabled={uploading || !uploadName}>
                        {uploading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Загрузить
                      </Button>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="google" className="space-y-3 mt-3">
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
                  
                  <div className="flex justify-end">
                    <Button 
                      onClick={handleGoogleSheetsUpload} 
                      disabled={uploading || !uploadName || !googleSheetsUrl}
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4 mr-2" />
                      )}
                      Загрузить из Google
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Templates List */}
            <div className="flex-1 overflow-hidden">
              <h3 className="font-medium mb-3">Загруженные категории</h3>
              
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Нет загруженных категорий</p>
                  <p className="text-sm">Загрузите Excel файл с характеристиками</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Название</TableHead>
                        <TableHead>Маркетплейс</TableHead>
                        <TableHead>Характеристик</TableHead>
                        <TableHead>Дата создания</TableHead>
                        <TableHead className="w-[150px]">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">{template.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {template.marketplace === 'wildberries' ? 'WB' : 'Ozon'}
                            </Badge>
                          </TableCell>
                          <TableCell>{template.characteristics.length}</TableCell>
                          <TableCell>
                            {new Date(template.created_at).toLocaleDateString('ru-RU')}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewTemplate(template)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSelect(template)}
                              >
                                Выбрать
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(template.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Характеристики: {previewTemplate?.name}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Группа</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Обязательное</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewTemplate?.characteristics.map((char) => (
                  <TableRow key={char.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{char.name}</div>
                        {char.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {char.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {char.group}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {char.type}
                      {char.unit && ` (${char.unit})`}
                    </TableCell>
                    <TableCell>
                      {char.required ? (
                        <Badge variant="destructive" className="text-xs">Да</Badge>
                      ) : (
                        <span className="text-muted-foreground">Нет</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Закрыть
            </Button>
            <Button onClick={() => {
              if (previewTemplate) {
                handleSelect(previewTemplate);
                setPreviewTemplate(null);
              }
            }}>
              Выбрать эту категорию
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
