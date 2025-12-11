import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CardForm } from './CardForm';
import { cardsApi, MarketplaceCard } from '@/api/client';
import { toast } from 'sonner';

interface CardCreatorProps {
  className?: string;
}

export function CardCreator({ className }: CardCreatorProps) {
  const [cards, setCards] = useState<MarketplaceCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const fetchCards = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedCards = await cardsApi.getAll();
      setCards(fetchedCards);
    } catch (e: any) {
      const errorMsg = e.message || 'Ошибка загрузки карточек';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleAddCard = useCallback(async (cardData: Omit<MarketplaceCard, 'id' | 'createdAt'>) => {
    try {
      const newCard = await cardsApi.create(cardData);
      setCards((prev) => [...prev, newCard]);
      setIsFormOpen(false);
      toast.success('Карточка добавлена');
    } catch (e: any) {
      toast.error(e.message || 'Ошибка добавления карточки');
      throw e;
    }
  }, []);

  const getStatusBadge = (status: MarketplaceCard['status']) => {
    const variants: Record<MarketplaceCard['status'], { variant: 'default' | 'secondary' | 'outline'; label: string }> = {
      draft: { variant: 'secondary', label: 'Черновик' },
      ready: { variant: 'default', label: 'Готова' },
      published: { variant: 'outline', label: 'Опубликована' },
    };
    const { variant, label } = variants[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getMarketplaceBadge = (marketplace: MarketplaceCard['marketplace']) => {
    const labels: Record<MarketplaceCard['marketplace'], string> = {
      wildberries: 'WB',
      ozon: 'Ozon',
    };
    return <Badge variant="outline">{labels[marketplace]}</Badge>;
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">Карточки</h3>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchCards}
            disabled={isLoading}
            title="Обновить"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFormOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-center py-4 text-destructive">
          <p className="text-sm mb-2">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchCards}>
            Повторить
          </Button>
        </div>
      )}

      {isLoading && cards.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : cards.length === 0 && !error ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Нет карточек</p>
          <p className="text-xs mt-1">Нажмите "Добавить" для создания</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Маркетплейс</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((card) => (
                <TableRow key={card.id} data-testid="card-row">
                  <TableCell className="font-medium" data-testid="card-name">
                    {card.name}
                  </TableCell>
                  <TableCell data-testid="card-marketplace">
                    {getMarketplaceBadge(card.marketplace)}
                  </TableCell>
                  <TableCell data-testid="card-status">
                    {getStatusBadge(card.status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CardForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleAddCard}
      />
    </div>
  );
}
