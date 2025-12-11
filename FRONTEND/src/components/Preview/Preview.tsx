import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ZoomIn, ZoomOut, Download, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { foldersApi } from '@/api/client';
import { cn } from '@/lib/utils';
import { getPointSetColor } from '@/utils/pointSetUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Preview() {
  const { templates, selectedTemplateId, folders, previewPrintFile, setPreviewPrintFile } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [printFiles, setPrintFiles] = useState<{ name: string; path: string }[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  // Multi-area print files - one per point set
  const [multiPrintFiles, setMultiPrintFiles] = useState<(string | null)[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  // Multi-mode is active when explicitly enabled AND has at least one point set
  const isMultiMode = selectedTemplate?.isMultiMode && (selectedTemplate?.pointSets?.length ?? 0) >= 1;
  const pointSetsCount = selectedTemplate?.pointSets?.length ?? 1;

  // Load print files when folder selected
  useEffect(() => {
    if (!selectedFolderId) {
      setPrintFiles([]);
      return;
    }

    foldersApi.getFiles(selectedFolderId)
      .then((files) => {
        setPrintFiles(files);
        // Auto-select first file if none selected
        if (files.length > 0 && !previewPrintFile) {
          setPreviewPrintFile(files[0].path);
        }
      })
      .catch(() => setPrintFiles([]));
  }, [selectedFolderId, previewPrintFile, setPreviewPrintFile]);

  // Initialize multi print files array when point sets change
  useEffect(() => {
    if (isMultiMode && pointSetsCount > 0) {
      setMultiPrintFiles(prev => {
        const newArr = [...prev];
        // Extend array if needed
        while (newArr.length < pointSetsCount) {
          newArr.push(null);
        }
        // Trim if too long
        return newArr.slice(0, pointSetsCount);
      });
    }
  }, [isMultiMode, pointSetsCount]);

  // Update multi print file for specific area
  const setMultiPrintFile = useCallback((index: number, path: string | null) => {
    setMultiPrintFiles(prev => {
      const newArr = [...prev];
      newArr[index] = path;
      return newArr;
    });
  }, []);

  // Update preview when template or print changes (debounced)
  useEffect(() => {
    if (!selectedTemplate) {
      setPreviewUrl(null);
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setIsLoading(true);
    
    // Debounce preview updates by 300ms for responsive feel
    debounceRef.current = setTimeout(() => {
      const baseUrl = `/api/templates/${selectedTemplate.id}/preview`;
      const params = new URLSearchParams();
      
      // In multi-mode, send multiple print files
      if (isMultiMode) {
        // Check if any files are selected
        const hasAnyFile = multiPrintFiles.some(f => f !== null);
        if (hasAnyFile) {
          // Send as comma-separated list, preserving order (empty string for unselected)
          // This ensures correct mapping: file1 -> area1, file2 -> area2, etc.
          params.set('print_files', multiPrintFiles.map(f => f || '').join(','));
        } else if (previewPrintFile) {
          // Fallback to single file for all areas
          params.set('print_file', previewPrintFile);
        }
      } else if (previewPrintFile) {
        params.set('print_file', previewPrintFile);
      }
      
      // Pass current settings to preview
      params.set('corner_radius', String(selectedTemplate.cornerRadius || 0));
      params.set('blend_strength', String(selectedTemplate.blendStrength || 0.25));
      params.set('change_color', String(selectedTemplate.changeBackgroundColor !== false));
      params.set('add_product', String(selectedTemplate.addProduct !== false));
      params.set('_', `${Date.now()}`);
      
      setPreviewUrl(`${baseUrl}?${params.toString()}`);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [
    selectedTemplate?.id, 
    previewPrintFile,
    isMultiMode,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(multiPrintFiles),
    selectedTemplate?.cornerRadius,
    selectedTemplate?.blendStrength,
    selectedTemplate?.changeBackgroundColor,
    selectedTemplate?.addProduct,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(selectedTemplate?.points),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(selectedTemplate?.pointSets)
  ]);

  const handleRefresh = useCallback(() => {
    if (!selectedTemplate) return;
    setIsLoading(true);
    const baseUrl = `/api/templates/${selectedTemplate.id}/preview`;
    const params = new URLSearchParams();
    if (previewPrintFile) {
      params.set('print_file', previewPrintFile);
    }
    params.set('_', `${Date.now()}`);
    setPreviewUrl(`${baseUrl}?${params.toString()}`);
    setTimeout(() => setIsLoading(false), 500);
  }, [selectedTemplate, previewPrintFile]);

  const handleDownload = useCallback(() => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `preview-${selectedTemplate?.name || 'card'}.png`;
    link.click();
  }, [previewUrl, selectedTemplate]);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header justify-between">
        <div className="flex items-center gap-2">
          <div className="panel-header-icon" style={{ background: 'linear-gradient(135deg, hsl(150 80% 50%), hsl(180 100% 50%))' }}>
            <Eye className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">Превью</span>
        </div>
        
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9"
          onClick={handleRefresh}
          disabled={!selectedTemplate}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Print file selector */}
      <div className="space-y-2 mb-4">
        <div className="flex gap-2">
          <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
            <SelectTrigger className="flex-1 h-9 text-xs bg-secondary/50 border-border/50">
              <SelectValue placeholder="Выберите папку" />
            </SelectTrigger>
            <SelectContent>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Single file selector - shown when not in multi-mode or as fallback */}
          {!isMultiMode && (
            <Select 
              value={previewPrintFile || ''} 
              onValueChange={(v) => setPreviewPrintFile(v || null)}
              disabled={!printFiles.length}
            >
              <SelectTrigger className="flex-1 h-9 text-xs bg-secondary/50 border-border/50">
                <SelectValue placeholder="Выберите принт" />
              </SelectTrigger>
              <SelectContent>
                {printFiles.map((file) => (
                  <SelectItem key={file.path} value={file.path}>
                    {file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Multi-area file selectors */}
        {isMultiMode && printFiles.length > 0 && (
          <div className="space-y-1.5">
            {Array.from({ length: pointSetsCount }).map((_, index) => (
              <div key={index} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: getPointSetColor(index) }}
                />
                <span className="text-xs text-muted-foreground w-14 shrink-0">
                  Обл. {index + 1}
                </span>
                <Select 
                  value={multiPrintFiles[index] || ''} 
                  onValueChange={(v) => setMultiPrintFile(index, v || null)}
                >
                  <SelectTrigger className="flex-1 h-8 text-xs bg-secondary/50 border-border/50">
                    <SelectValue placeholder="Выберите изображение" />
                  </SelectTrigger>
                  <SelectContent>
                    {printFiles.map((file) => (
                      <SelectItem key={file.path} value={file.path}>
                        {file.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview area */}
      <div className="flex-1 bg-background/50 rounded-xl overflow-hidden relative flex items-center justify-center cyber-grid">
        {!selectedTemplate ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4 animate-float">
              <Eye className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-muted-foreground font-medium">Выберите шаблон</p>
            <p className="text-xs text-muted-foreground/60 mt-1">для предпросмотра результата</p>
          </div>
        ) : (
          <div
            className="relative transition-transform duration-200"
            style={{ transform: `scale(${zoom / 100})` }}
          >
            {previewUrl && (
              <img
                key={previewUrl}
                src={previewUrl}
                alt="Preview"
                className="max-w-full max-h-[600px] object-contain rounded-lg shadow-2xl"
                onLoad={() => setIsLoading(false)}
                onError={() => setIsLoading(false)}
              />
            )}
            
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setZoom(Math.max(25, zoom - 25))}
            disabled={zoom <= 25}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground w-12 text-center">
            {zoom}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setZoom(Math.min(200, zoom + 25))}
            disabled={zoom >= 200}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          disabled={!selectedTemplate || !previewUrl} 
          className="border-primary/30 hover:bg-primary/10"
          onClick={handleDownload}
        >
          <Download className="w-4 h-4 mr-1.5" />
          Скачать
        </Button>
      </div>
    </div>
  );
}
