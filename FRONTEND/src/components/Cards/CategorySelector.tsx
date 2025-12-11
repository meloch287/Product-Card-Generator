import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { marketplaceApi, type Marketplace, type WBCategory, type OzonCategory } from '@/api/client';
import { Search, ChevronRight, ChevronDown, Folder, FolderOpen, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  parentId?: string;
  children?: Category[];
  path: string[];
}

interface CategorySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketplace: Marketplace;
  selectedCategory: Category | null;
  onCategorySelect: (category: Category) => void;
}

export function CategorySelector({
  open,
  onOpenChange,
  marketplace,
  selectedCategory,
  onCategorySelect
}: CategorySelectorProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Category[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [breadcrumbs, setBreadcrumbs] = useState<Category[]>([]);

  // Load categories when dialog opens
  useEffect(() => {
    if (open && categories.length === 0) {
      loadCategories();
    }
  }, [open]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      if (marketplace === 'wildberries') {
        const result = await marketplaceApi.getWBCategories();
        const wbCategories = result.categories.map((cat: WBCategory) => ({
          id: String(cat.subjectID),
          name: cat.subjectName,
          parentId: cat.parentID ? String(cat.parentID) : undefined,
          path: cat.parentName ? [cat.parentName, cat.subjectName] : [cat.subjectName]
        }));
        setCategories(buildCategoryTree(wbCategories));
      } else {
        const result = await marketplaceApi.getOzonCategories();
        setCategories(convertOzonCategories(result.categories));
      }
    } catch (error: any) {
      toast.error(`Ошибка загрузки категорий: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const buildCategoryTree = (flatCategories: any[]): Category[] => {
    const categoryMap = new Map<string, Category>();
    const rootCategories: Category[] = [];

    // Create category objects
    flatCategories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Build tree structure
    flatCategories.forEach(cat => {
      const category = categoryMap.get(cat.id)!;
      if (cat.parentId && categoryMap.has(cat.parentId)) {
        const parent = categoryMap.get(cat.parentId)!;
        parent.children!.push(category);
      } else {
        rootCategories.push(category);
      }
    });

    return rootCategories;
  };

  const convertOzonCategories = (ozonCategories: OzonCategory[]): Category[] => {
    const convertCategory = (cat: OzonCategory, path: string[] = []): Category => {
      const currentPath = [...path, cat.category_name];
      return {
        id: String(cat.description_category_id),
        name: cat.category_name,
        path: currentPath,
        children: cat.children?.map(child => convertCategory(child, currentPath)) || []
      };
    };

    return ozonCategories.map(cat => convertCategory(cat));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      if (marketplace === 'wildberries') {
        const result = await marketplaceApi.searchWBCategories(searchQuery);
        const searchCategories = result.categories.map((cat: WBCategory) => ({
          id: String(cat.subjectID),
          name: cat.subjectName,
          path: cat.parentName ? [cat.parentName, cat.subjectName] : [cat.subjectName]
        }));
        setSearchResults(searchCategories);
      } else {
        // For Ozon, search in loaded categories
        const searchInCategories = (cats: Category[], query: string): Category[] => {
          const results: Category[] = [];
          const lowerQuery = query.toLowerCase();
          
          const search = (categories: Category[]) => {
            categories.forEach(cat => {
              if (cat.name.toLowerCase().includes(lowerQuery)) {
                results.push(cat);
              }
              if (cat.children) {
                search(cat.children);
              }
            });
          };
          
          search(cats);
          return results;
        };
        
        setSearchResults(searchInCategories(categories, searchQuery));
      }
    } catch (error: any) {
      toast.error(`Ошибка поиска: ${error.message}`);
    } finally {
      setSearching(false);
    }
  };

  const toggleExpanded = (categoryId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const handleCategoryClick = (category: Category) => {
    onCategorySelect(category);
    onOpenChange(false);
  };

  const renderCategoryTree = (categories: Category[], level = 0) => {
    return categories.map(category => {
      const hasChildren = category.children && category.children.length > 0;
      const isExpanded = expandedNodes.has(category.id);
      
      return (
        <div key={category.id} className="select-none">
          <div
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors',
              selectedCategory?.id === category.id && 'bg-primary/10 text-primary'
            )}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
          >
            {hasChildren ? (
              <button
                onClick={() => toggleExpanded(category.id)}
                className="p-0.5 hover:bg-accent rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ) : (
              <div className="w-4" />
            )}
            
            <button
              onClick={() => handleCategoryClick(category)}
              className="flex items-center gap-2 flex-1 text-left"
            >
              {hasChildren ? (
                isExpanded ? (
                  <FolderOpen className="h-4 w-4 text-blue-500" />
                ) : (
                  <Folder className="h-4 w-4 text-blue-500" />
                )
              ) : (
                <div className="h-4 w-4 rounded bg-green-500/20 border border-green-500/30" />
              )}
              <span className="text-sm">{category.name}</span>
            </button>
          </div>
          
          {hasChildren && isExpanded && (
            <div>
              {renderCategoryTree(category.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Выбор категории - {marketplace === 'wildberries' ? 'Wildberries' : 'Ozon'}
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск категории..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Найти'}
          </Button>
          {searchQuery && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Selected category breadcrumbs */}
        {selectedCategory && (
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
            <Label className="text-sm font-medium">Выбрано:</Label>
            <div className="flex items-center gap-1">
              {selectedCategory.path.map((segment, index) => (
                <div key={index} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <Badge variant="outline" className="text-xs">
                    {segment}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        <div className="flex-1 overflow-y-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="p-2">
              <div className="text-sm font-medium mb-2 text-muted-foreground">
                Результаты поиска ({searchResults.length})
              </div>
              {searchResults.map(category => (
                <div
                  key={category.id}
                  onClick={() => handleCategoryClick(category)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors',
                    selectedCategory?.id === category.id && 'bg-primary/10 text-primary'
                  )}
                >
                  <div className="h-4 w-4 rounded bg-green-500/20 border border-green-500/30" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{category.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {category.path.join(' → ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-2">
              {renderCategoryTree(categories)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button 
            onClick={() => onOpenChange(false)}
            disabled={!selectedCategory}
          >
            Выбрать
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}