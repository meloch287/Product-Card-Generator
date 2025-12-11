import { useState, useCallback, useEffect } from 'react';
import { FolderOpen, Plus, X, FileImage, Folder, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { foldersApi } from '@/api/client';

export function FolderList() {
  const { folders, addFolders, removeFolder, fetchFolders } = useAppStore();
  const [isAdding, setIsAdding] = useState(false);

  // Fetch folders on mount
  useEffect(() => {
    fetchFolders().catch((e) => toast.error(`Ошибка загрузки папок: ${e.message}`));
  }, [fetchFolders]);

  const handleBrowseFolder = useCallback(async () => {
    setIsAdding(true);
    try {
      // Open system folder dialog via backend
      const result = await foldersApi.browse();
      
      if (result.paths && result.paths.length > 0) {
        // Add all selected folders
        const { added, addedCount, skippedCount } = await addFolders(result.paths);
        
        if (addedCount > 0 && skippedCount === 0) {
          // All folders added successfully
          const totalFiles = added.reduce((sum, f) => sum + f.fileCount, 0);
          toast.success(`Добавлено ${addedCount} папок (${totalFiles} файлов)`);
        } else if (addedCount > 0 && skippedCount > 0) {
          // Some folders added, some skipped (duplicates)
          const totalFiles = added.reduce((sum, f) => sum + f.fileCount, 0);
          toast.success(`Добавлено ${addedCount} папок (${totalFiles} файлов), ${skippedCount} пропущено`);
        } else if (addedCount === 0 && skippedCount > 0) {
          // All folders were duplicates
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
  }, [addFolders]);

  const handleRemoveFolder = useCallback(async (id: string, name: string) => {
    try {
      await removeFolder(id);
      toast.info(`Папка "${name}" удалена`);
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    }
  }, [removeFolder]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-icon" style={{ background: 'linear-gradient(135deg, hsl(280 100% 65%), hsl(320 100% 60%))' }}>
          <Folder className="w-4 h-4 text-accent-foreground" />
        </div>
        <span className="font-semibold">Папки с принтами</span>
        <span className="text-muted-foreground font-normal text-xs ml-auto bg-secondary/80 px-2 py-0.5 rounded-full">
          {folders.length}
        </span>
      </div>

      <div className="space-y-2">
        {folders.length === 0 ? (
          <div className="drop-zone py-8">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-2">
              <FolderOpen className="w-6 h-6 text-accent" />
            </div>
            <p className="text-sm font-medium">Нет добавленных папок</p>
            <p className="text-xs text-muted-foreground">Нажмите кнопку ниже чтобы выбрать папку</p>
          </div>
        ) : (
          folders.map((folder, index) => (
            <div 
              key={folder.id} 
              className="folder-item group"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <FolderOpen className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{folder.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileImage className="w-3 h-3" />
                  {folder.fileCount} файлов
                </p>
              </div>
              <button
                className="btn-icon opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/20 hover:text-destructive"
                onClick={() => handleRemoveFolder(folder.id, folder.name)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
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
          Выбрать папку
        </Button>
      </div>
    </div>
  );
}
