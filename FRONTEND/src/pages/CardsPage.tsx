import { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/Header/Header';
import { cardsApi, marketplaceApi, type MarketplaceCard, type Marketplace, type CardStatus } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Search, Settings, Trash2, Package, Loader2, RefreshCw, X, FileSpreadsheet, Table as TableIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { AdvancedCardForm } from '@/components/Cards/AdvancedCardForm';
import { SettingsDialog } from '@/components/Cards/SettingsDialog';
import { ImportDialog } from '@/components/Cards/ImportDialog';
import { BulkEditTable } from '@/components/Cards/BulkEditTable';
import { VirtualCardGrid } from '@/components/Cards/VirtualCardGrid';
import { FilterResultsCounter } from '@/components/Cards/FilterResultsCounter';
import { CardsErrorBoundary } from '@/components/Cards/CardsErrorBoundary';
import { ErrorDisplay } from '@/components/Cards/ErrorDisplay';
import { LoadingProgress } from '@/components/Cards/LoadingProgress';
import { useOptimizedFilter } from '@/hooks/useOptimizedFilter';
import { useCardsLoader } from '@/hooks/useCardsLoader';
import { toast } from 'sonner';

const CardsPage = () => {
  // Use streaming cards loader with progress tracking
  // Requirements: 1.1, 1.2, 1.3, 5.1, 5.2, 5.4
  const {
    cards,
    isLoading,
    progress,
    loadedCount,
    totalCount: loadingTotalCount,
    error: loadError,
    reload: loadCards,
  } = useCardsLoader();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<MarketplaceCard | null>(null);
  const [publishingCard, setPublishingCard] = useState<MarketplaceCard | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [deletingCard, setDeletingCard] = useState<MarketplaceCard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [deletingMultiple, setDeletingMultiple] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  // Use optimized filter hook with debounced search and memoization
  // Requirements: 4.1, 4.2, 4.3, 4.4, 5.3
  const {
    filter,
    setSearch,
    setMarketplace,
    setStatus,
    filteredCards,
    totalCount,
    filteredCount,
    isFiltering,
  } = useOptimizedFilter(cards);

  // Show toast on load error
  useEffect(() => {
    if (loadError) {
      toast.error(`Ошибка загрузки: ${loadError.message}`);
    }
  }, [loadError]);

  const handleDelete = async () => {
    if (!deletingCard) return;

    setDeleting(true);
    try {
      await cardsApi.delete(deletingCard.id);
      toast.success('Карточка удалена');
      setDeletingCard(null);
      // Reload cards to reflect deletion
      loadCards();
    } catch (e: any) {
      toast.error(`Ошибка удаления: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteMultiple = async () => {
    if (selectedCards.size === 0) return;

    setDeletingMultiple(true);
    try {
      // Use batch delete for efficiency (single request instead of N requests)
      const result = await cardsApi.batchDelete(Array.from(selectedCards));
      
      setSelectedCards(new Set());
      toast.success(`Удалено ${result.deleted} карточек`);
      // Reload cards to reflect deletions
      loadCards();
    } catch (e: any) {
      toast.error(`Ошибка удаления: ${e.message}`);
    } finally {
      setDeletingMultiple(false);
    }
  };

  const handleSelectCard = (cardId: string, selected: boolean) => {
    setSelectedCards(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(cardId);
      } else {
        newSet.delete(cardId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedCards(new Set(filteredCards.map(c => c.id)));
    } else {
      setSelectedCards(new Set());
    }
  };

  const handlePublish = async () => {
    if (!publishingCard) return;

    if (!publishingCard.category_id) {
      toast.error('Выберите категорию перед публикацией');
      return;
    }

    setPublishing(true);
    try {
      const result = await marketplaceApi.publish({
        card_id: publishingCard.id,
        subject_id: publishingCard.marketplace === 'wildberries' ? Number(publishingCard.category_id) : undefined,
        category_id: publishingCard.marketplace === 'ozon' ? Number(publishingCard.category_id) : undefined,
      });

      if (result.success) {
        toast.success(result.message);
        loadCards();
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(`Ошибка публикации: ${e.message}`);
    } finally {
      setPublishing(false);
      setPublishingCard(null);
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-border bg-card/50 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Создать карточку
              </Button>

              <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Импорт из Excel
              </Button>

              {filteredCards.length > 0 && (
                <Button variant="outline" onClick={() => setIsBulkEditOpen(true)}>
                  <TableIcon className="h-4 w-4 mr-2" />
                  Редактировать таблицей
                </Button>
              )}

              {selectedCards.size > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-md">
                    <span className="text-sm font-medium">
                      Выбрано: {selectedCards.size}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCards(new Set())}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteMultiple}
                    disabled={deletingMultiple}
                  >
                    {deletingMultiple ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Удалить выбранные
                  </Button>
                </>
              )}

              <Select
                value={filter.marketplace}
                onValueChange={(v) => setMarketplace(v as Marketplace | 'all')}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Маркетплейс" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все маркетплейсы</SelectItem>
                  <SelectItem value="wildberries">Wildberries</SelectItem>
                  <SelectItem value="ozon">Ozon</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filter.status}
                onValueChange={(v) => setStatus(v as CardStatus | 'all')}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="draft">Черновики</SelectItem>
                  <SelectItem value="ready">Готовые</SelectItem>
                  <SelectItem value="published">Опубликованные</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="icon" onClick={loadCards} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>

              {filteredCards.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedCards.size === filteredCards.length && filteredCards.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">Выбрать все</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Filter results counter - Requirements: 4.4, 5.3 */}
              <FilterResultsCounter
                filteredCount={filteredCount}
                totalCount={totalCount}
                isFiltering={isFiltering}
              />

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск..."
                  value={filter.search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-[250px]"
                />
              </div>

              <Button variant="outline" size="icon" onClick={() => setIsSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Cards Grid - Virtualized with error boundary (Requirement 5.4) */}
        <div className="flex-1 overflow-hidden p-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingProgress
                progress={progress}
                loadedCount={loadedCount}
                totalCount={loadingTotalCount}
                isLoading={isLoading}
              />
            </div>
          ) : loadError ? (
            <ErrorDisplay
              error={loadError}
              onRetry={loadCards}
              isRetrying={isLoading}
            />
          ) : filteredCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Package className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">Нет карточек</h3>
              <p className="text-muted-foreground mb-4">
                Создайте первую карточку товара для маркетплейса
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Создать карточку
              </Button>
            </div>
          ) : (
            <CardsErrorBoundary componentName="сетку карточек">
              <VirtualCardGrid
                cards={filteredCards}
                onEdit={(card) => setEditingCard(card)}
                onDelete={(card) => setDeletingCard(card)}
                onPublish={(card) => setPublishingCard(card)}
                selectedIds={selectedCards}
                onSelect={handleSelectCard}
              />
            </CardsErrorBoundary>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <AdvancedCardForm
        open={isCreateOpen || !!editingCard}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingCard(null);
          }
        }}
        card={editingCard}
        onSaved={loadCards}
      />

      {/* Settings Dialog */}
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />

      {/* Import Dialog */}
      <ImportDialog 
        open={isImportOpen} 
        onOpenChange={setIsImportOpen}
        onImported={loadCards}
      />

      {/* Bulk Edit Table */}
      <BulkEditTable
        open={isBulkEditOpen}
        onOpenChange={setIsBulkEditOpen}
        cards={filteredCards}
        onSaved={loadCards}
      />

      {/* Publish Confirmation Dialog */}
      <Dialog open={!!publishingCard} onOpenChange={(open) => !open && setPublishingCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Публикация карточки</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите опубликовать карточку "{publishingCard?.name}" на{' '}
              {publishingCard?.marketplace === 'wildberries' ? 'Wildberries' : 'Ozon'}?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              После публикации карточка будет отправлена на модерацию маркетплейса.
            </p>
            {publishingCard && !publishingCard.category_id && (
              <p className="text-sm text-destructive mt-2">
                ⚠️ Категория не выбрана. Отредактируйте карточку и выберите категорию.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishingCard(null)}>
              Отмена
            </Button>
            <Button
              onClick={handlePublish}
              disabled={publishing || !publishingCard?.category_id}
            >
              {publishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Опубликовать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingCard} onOpenChange={(open) => !open && setDeletingCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удаление карточки</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить карточку "{deletingCard?.name}"?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Это действие нельзя отменить. Карточка будет удалена навсегда.
            </p>
            {deletingCard?.status === 'published' && (
              <p className="text-sm text-destructive mt-2">
                ⚠️ Внимание: карточка уже опубликована на маркетплейсе. Удаление из системы не удалит её с маркетплейса.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCard(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CardsPage;
