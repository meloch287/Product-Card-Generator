import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { marketplaceApi, type Marketplace } from '@/api/client';
import { Loader2, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Characteristic {
  id: number;
  name: string;
  type: string; // text, number, select, multiselect, boolean, date
  required: boolean;
  values?: string[]; // For select/multiselect
  unit?: string; // Unit of measurement
  minValue?: number;
  maxValue?: number;
}

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
}

interface CharacteristicsFormProps {
  marketplace: Marketplace;
  categoryId: string;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  categoryTemplate?: CategoryTemplate | null;
}

export function CharacteristicsForm({
  marketplace,
  categoryId,
  values,
  onChange,
  categoryTemplate
}: CharacteristicsFormProps) {
  const [characteristics, setCharacteristics] = useState<Characteristic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If we have a category template, use its characteristics
    if (categoryTemplate) {
      const templateChars = categoryTemplate.characteristics.map((char, index) => ({
        id: index,
        name: char.name,
        type: char.type || 'text',
        required: char.required || false,
        values: char.values,
        unit: char.unit
      }));
      setCharacteristics(templateChars);
      setLoading(false);
    } else if (categoryId) {
      loadCharacteristics();
    } else {
      setCharacteristics([]);
    }
  }, [categoryId, marketplace, categoryTemplate]);

  const loadCharacteristics = async () => {
    setLoading(true);
    try {
      if (marketplace === 'wildberries') {
        const result = await marketplaceApi.getWBCharacteristics(Number(categoryId));
        const wbCharacteristics = result.characteristics.map((char: any) => ({
          id: char.id,
          name: char.name,
          type: char.type || 'text',
          required: char.required || false,
          values: char.values,
          unit: char.unit
        }));
        setCharacteristics(wbCharacteristics);
      } else {
        const result = await marketplaceApi.getOzonAttributes(Number(categoryId));
        const ozonCharacteristics = result.attributes.map((attr: any) => ({
          id: attr.id,
          name: attr.name,
          type: attr.type || 'text',
          required: attr.is_required || false,
          values: attr.values,
          unit: attr.unit
        }));
        setCharacteristics(ozonCharacteristics);
      }
    } catch (error: any) {
      // Don't show error if we have a template
      if (!categoryTemplate) {
        toast.error(`Ошибка загрузки характеристик: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (charId: number, value: any) => {
    const newValues = { ...values, [charId]: value };
    onChange(newValues);
  };

  const handleMultiselectAdd = (charId: number, value: string) => {
    const currentValues = values[charId] || [];
    if (!currentValues.includes(value)) {
      handleValueChange(charId, [...currentValues, value]);
    }
  };

  const handleMultiselectRemove = (charId: number, value: string) => {
    const currentValues = values[charId] || [];
    handleValueChange(charId, currentValues.filter((v: string) => v !== value));
  };

  const renderCharacteristicInput = (char: Characteristic) => {
    const value = values[char.id];

    switch (char.type) {
      case 'number':
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value || ''}
              onChange={(e) => handleValueChange(char.id, Number(e.target.value))}
              min={char.minValue}
              max={char.maxValue}
              placeholder={`Введите ${char.name.toLowerCase()}`}
            />
            {char.unit && (
              <span className="text-sm text-muted-foreground">{char.unit}</span>
            )}
          </div>
        );

      case 'select':
        return (
          <Select
            value={value || ''}
            onValueChange={(v) => handleValueChange(char.id, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Выберите ${char.name.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {char.values?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'multiselect':
        const selectedValues = value || [];
        return (
          <div className="space-y-2">
            <Select
              onValueChange={(v) => handleMultiselectAdd(char.id, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Добавить ${char.name.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {char.values?.filter(option => !selectedValues.includes(option)).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedValues.map((val: string) => (
                  <Badge key={val} variant="secondary" className="text-xs">
                    {val}
                    <button
                      onClick={() => handleMultiselectRemove(char.id, val)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={value || false}
              onCheckedChange={(checked) => handleValueChange(char.id, checked)}
            />
            <span className="text-sm">Да</span>
          </div>
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => handleValueChange(char.id, e.target.value)}
          />
        );

      case 'textarea':
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => handleValueChange(char.id, e.target.value)}
            placeholder={`Введите ${char.name.toLowerCase()}`}
            rows={3}
          />
        );

      default: // text
        return (
          <Input
            value={value || ''}
            onChange={(e) => handleValueChange(char.id, e.target.value)}
            placeholder={`Введите ${char.name.toLowerCase()}`}
          />
        );
    }
  };

  if (!categoryId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
          <Plus className="w-6 h-6" />
        </div>
        <p className="text-sm">Выберите категорию для отображения характеристик</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Загрузка характеристик...</span>
      </div>
    );
  }

  if (characteristics.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">Для данной категории нет дополнительных характеристик</p>
      </div>
    );
  }

  // Group characteristics by required/optional
  const requiredChars = characteristics.filter(char => char.required);
  const optionalChars = characteristics.filter(char => !char.required);

  return (
    <div className="space-y-6">
      {/* Required characteristics */}
      {requiredChars.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Обязательные характеристики</h3>
            <Badge variant="destructive" className="text-xs">
              Обязательно
            </Badge>
          </div>
          
          <div className="grid gap-4">
            {requiredChars.map((char) => (
              <div key={char.id} className="space-y-2">
                <Label className="text-sm font-medium">
                  {char.name}
                  <span className="text-destructive ml-1">*</span>
                  {char.unit && (
                    <span className="text-muted-foreground ml-1">({char.unit})</span>
                  )}
                </Label>
                {renderCharacteristicInput(char)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional characteristics */}
      {optionalChars.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Дополнительные характеристики</h3>
            <Badge variant="outline" className="text-xs">
              Опционально
            </Badge>
          </div>
          
          <div className="grid gap-4">
            {optionalChars.map((char) => (
              <div key={char.id} className="space-y-2">
                <Label className="text-sm font-medium">
                  {char.name}
                  {char.unit && (
                    <span className="text-muted-foreground ml-1">({char.unit})</span>
                  )}
                </Label>
                {renderCharacteristicInput(char)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}