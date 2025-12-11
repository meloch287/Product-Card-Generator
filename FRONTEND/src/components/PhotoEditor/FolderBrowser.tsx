import { useState, useCallback, useEffect } from 'react';
import { FolderOpen, Plus, ChevronRight, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { foldersApi } from '@/api/client';
import { cn } from '@/lib/utils';

interface FolderBrowserProps {
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string) => void;
}

export function FolderBrowser({ selectedFolderId, onFolderSelect }: FolderBrowserProps) {
  const { folders, addFolders, fetchFolders, removeFolder } = useAppStore();
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch folders on mount
  useEffect(() => {
    setIsLoading(true);
    fetchFolders()
      .catch((e) => toast.error(`Ошибка загрузки папок: ${e.message}`))
      .finally(() => setIsLoading(false));
  }, [fetchFolders]);

  const handleBrowseFolder = useCallback(async () => {
    setIsAdding(true);
    try {
      // Opens native dialog, scans for subfolders with images
      const result = await foldersApi.browse();
      
      if (result.paths && result.paths.length > 0) {
        const { added, addedCount, skippedCount } = await addFolders(result.paths);
        
        if (addedCount > 0) {
          const totalFiles = added.reduce((sum, f) => sum + f.fileCount, 0);
          toast.success(`Добавлено ${addedCount} папок (${totalFiles} файлов)`);
          // Auto-select first added folder
          if (added.length > 0) {
            onFolderSelect(added[0].id);
          }
        } else if (skippedCount > 0) {
          toast.info('Все выбранные папки уже добавлены');
        }
      }
    } catch (e: any) {
      if (!e.message.includes('No folder selected')) {
        toast.error(`Ошибка: ${e.message}`);
      }
    } finally {
      setIsAdding(false);
    }
  }, [addFolders, onFolderSelect]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {folders.length === 0 ? (
        <div className="text-center py-6">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center mx-auto mb-2">
            <FolderOpen className="w-5 h-5 text-accent" />
          </div>
          <p className="text-xs text-muted-foreground">Нет добавленных папок</p>
        </div>
      ) : (
        <div className="space-y-1">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={cn(
                'group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
                'hover:bg-accent/10',
                selectedFolderId === folder.id && 'bg-accent/20 text-accent-foreground'
              )}
            >
              <button
                onClick={() => onFolderSelect(folder.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <FolderOpen className="w-4 h-4 text-accent shrink-0" />
                <span className="text-sm truncate flex-1">{folder.name}</span>
                <span className="text-xs text-muted-foreground">{folder.fileCount}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFolder(folder.id)
                    .then(() => {
                      toast.success('Папка удалена');
                      if (selectedFolderId === folder.id) {
                        onFolderSelect(folders[0]?.id || '');
                      }
                    })
                    .catch((err) => toast.error(`Ошибка: ${err.message}`));
                }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                title="Удалить папку"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed border-accent/30 hover:border-accent/50 hover:bg-accent/5"
        onClick={handleBrowseFolder}
        disabled={isAdding}
      >
        {isAdding ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <Plus className="w-4 h-4 mr-1.5" />
        )}
        Добавить папку
      </Button>
    </div>
  );
}
