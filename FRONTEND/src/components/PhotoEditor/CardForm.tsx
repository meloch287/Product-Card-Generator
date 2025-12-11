import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MarketplaceCard } from '@/api/client';

interface CardFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<MarketplaceCard, 'id' | 'createdAt'>) => Promise<void>;
}

type Marketplace = MarketplaceCard['marketplace'];
type CardStatus = MarketplaceCard['status'];

export function CardForm({ open, onOpenChange, onSubmit }: CardFormProps) {
  const [name, setName] = useState('');
  const [marketplace, setMarketplace] = useState<Marketplace>('wildberries');
  const [status, setStatus] = useState<CardStatus>('draft');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        marketplace,
        status,
        data: {},
      });
      // Reset form on success
      setName('');
      setMarketplace('wildberries');
      setStatus('draft');
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        // Reset form when closing
        setName('');
        setMarketplace('wildberries');
        setStatus('draft');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Новая карточка</DialogTitle>
          <DialogDescription>
            Создайте карточку товара для маркетплейса
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Введите название карточки"
                disabled={isSubmitting}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="marketplace">Маркетплейс</Label>
              <Select
                value={marketplace}
                onValueChange={(v) => setMarketplace(v as Marketplace)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="marketplace">
                  <SelectValue placeholder="Выберите маркетплейс" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wildberries">Wildberries</SelectItem>
                  <SelectItem value="ozon">Ozon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Статус</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as CardStatus)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Выберите статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Черновик</SelectItem>
                  <SelectItem value="ready">Готова</SelectItem>
                  <SelectItem value="published">Опубликована</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={!name.trim() || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
