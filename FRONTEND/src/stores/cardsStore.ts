import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Marketplace = 'wildberries' | 'ozon';
export type CardStatus = 'draft' | 'ready' | 'published';

export interface MarketplaceCard {
  id: string;
  name: string;
  description: string;
  marketplace: Marketplace;
  status: CardStatus;
  brand: string;
  article: string;
  barcode: string;
  price: number;
  discount: number;
  categoryId: string;
  categoryName: string;
  images: string[];
  marketplaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceSettings {
  wbApiKey: string;
  ozonClientId: string;
  ozonApiKey: string;
}

interface CardsState {
  cards: MarketplaceCard[];
  settings: MarketplaceSettings;
  filter: {
    marketplace: Marketplace | 'all';
    status: CardStatus | 'all';
    search: string;
  };
  
  // Actions
  addCard: (card: Omit<MarketplaceCard, 'id' | 'createdAt' | 'updatedAt'>) => MarketplaceCard;
  updateCard: (id: string, data: Partial<MarketplaceCard>) => void;
  deleteCard: (id: string) => void;
  getCard: (id: string) => MarketplaceCard | undefined;
  
  setFilter: (filter: Partial<CardsState['filter']>) => void;
  getFilteredCards: () => MarketplaceCard[];
  
  updateSettings: (settings: Partial<MarketplaceSettings>) => void;
}

const generateId = () => `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useCardsStore = create<CardsState>()(
  persist(
    (set, get) => ({
      cards: [],
      settings: {
        wbApiKey: '',
        ozonClientId: '',
        ozonApiKey: '',
      },
      filter: {
        marketplace: 'all',
        status: 'all',
        search: '',
      },

      addCard: (cardData) => {
        const now = new Date().toISOString();
        const newCard: MarketplaceCard = {
          ...cardData,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ cards: [...state.cards, newCard] }));
        return newCard;
      },

      updateCard: (id, data) => {
        set((state) => ({
          cards: state.cards.map((card) =>
            card.id === id
              ? { ...card, ...data, updatedAt: new Date().toISOString() }
              : card
          ),
        }));
      },

      deleteCard: (id) => {
        set((state) => ({
          cards: state.cards.filter((card) => card.id !== id),
        }));
      },

      getCard: (id) => {
        return get().cards.find((card) => card.id === id);
      },

      setFilter: (filter) => {
        set((state) => ({
          filter: { ...state.filter, ...filter },
        }));
      },

      getFilteredCards: () => {
        const { cards, filter } = get();
        return cards.filter((card) => {
          if (filter.marketplace !== 'all' && card.marketplace !== filter.marketplace) {
            return false;
          }
          if (filter.status !== 'all' && card.status !== filter.status) {
            return false;
          }
          if (filter.search) {
            const search = filter.search.toLowerCase();
            return (
              card.name.toLowerCase().includes(search) ||
              card.article.toLowerCase().includes(search) ||
              card.brand.toLowerCase().includes(search)
            );
          }
          return true;
        });
      },

      updateSettings: (settings) => {
        set((state) => ({
          settings: { ...state.settings, ...settings },
        }));
      },
    }),
    {
      name: 'cards-store',
    }
  )
);
