import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { marketplaceApi, type Marketplace } from '@/api/client';
import { toast } from 'sonner';
import { Eye, EyeOff, ExternalLink, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [form, setForm] = useState({
    wb_api_key: '',
    ozon_client_id: '',
    ozon_api_key: '',
  });
  const [showKeys, setShowKeys] = useState({
    wb_api_key: false,
    ozon_client_id: false,
    ozon_api_key: false,
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<Marketplace | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    wildberries?: boolean;
    ozon?: boolean;
  }>({});

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    try {
      const settings = await marketplaceApi.getSettings();
      setForm({
        wb_api_key: settings.wb_api_key || '',
        ozon_client_id: settings.ozon_client_id || '',
        ozon_api_key: settings.ozon_api_key || '',
      });
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Only send non-masked values
      const updates: Record<string, string> = {};
      if (form.wb_api_key && form.wb_api_key !== '***') {
        updates.wb_api_key = form.wb_api_key;
      }
      if (form.ozon_client_id && form.ozon_client_id !== '***') {
        updates.ozon_client_id = form.ozon_client_id;
      }
      if (form.ozon_api_key && form.ozon_api_key !== '***') {
        updates.ozon_api_key = form.ozon_api_key;
      }

      if (Object.keys(updates).length > 0) {
        await marketplaceApi.updateSettings(updates);
      }
      
      toast.success('Настройки сохранены');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Ошибка сохранения: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (marketplace: Marketplace) => {
    setTesting(marketplace);
    try {
      // Save current settings first if changed
      const updates: Record<string, string> = {};
      if (marketplace === 'wildberries' && form.wb_api_key && form.wb_api_key !== '***') {
        updates.wb_api_key = form.wb_api_key;
      }
      if (marketplace === 'ozon') {
        if (form.ozon_client_id && form.ozon_client_id !== '***') {
          updates.ozon_client_id = form.ozon_client_id;
        }
        if (form.ozon_api_key && form.ozon_api_key !== '***') {
          updates.ozon_api_key = form.ozon_api_key;
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await marketplaceApi.updateSettings(updates);
      }

      const result = await marketplaceApi.testConnection(marketplace);
      setConnectionStatus((s) => ({ ...s, [marketplace]: result.success }));
      
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      setConnectionStatus((s) => ({ ...s, [marketplace]: false }));
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setTesting(null);
    }
  };

  const toggleShow = (key: keyof typeof showKeys) => {
    setShowKeys((s) => ({ ...s, [key]: !s[key] }));
  };

  const getStatusIcon = (marketplace: Marketplace) => {
    if (testing === marketplace) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (connectionStatus[marketplace] === true) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (connectionStatus[marketplace] === false) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Настройки маркетплейсов</DialogTitle>
          <DialogDescription>
            Введите API ключи для интеграции с маркетплейсами
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Wildberries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-purple-400">Wildberries</h3>
                {getStatusIcon('wildberries')}
              </div>
              <a
                href="https://seller.wildberries.ru/supplier-settings/access-to-api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                Получить ключ <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wb_api_key">API ключ</Label>
              <div className="relative">
                <Input
                  id="wb_api_key"
                  type={showKeys.wb_api_key ? 'text' : 'password'}
                  value={form.wb_api_key}
                  onChange={(e) => setForm((f) => ({ ...f, wb_api_key: e.target.value }))}
                  placeholder="Введите API ключ Wildberries"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => toggleShow('wb_api_key')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKeys.wb_api_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestConnection('wildberries')}
                disabled={testing !== null || !form.wb_api_key}
              >
                {testing === 'wildberries' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Проверить подключение
              </Button>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Ozon */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-blue-400">Ozon</h3>
                {getStatusIcon('ozon')}
              </div>
              <a
                href="https://seller.ozon.ru/app/settings/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                Получить ключи <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ozon_client_id">Client ID</Label>
              <div className="relative">
                <Input
                  id="ozon_client_id"
                  type={showKeys.ozon_client_id ? 'text' : 'password'}
                  value={form.ozon_client_id}
                  onChange={(e) => setForm((f) => ({ ...f, ozon_client_id: e.target.value }))}
                  placeholder="Введите Client ID"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => toggleShow('ozon_client_id')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKeys.ozon_client_id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ozon_api_key">API ключ</Label>
              <div className="relative">
                <Input
                  id="ozon_api_key"
                  type={showKeys.ozon_api_key ? 'text' : 'password'}
                  value={form.ozon_api_key}
                  onChange={(e) => setForm((f) => ({ ...f, ozon_api_key: e.target.value }))}
                  placeholder="Введите API ключ Ozon"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => toggleShow('ozon_api_key')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKeys.ozon_api_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestConnection('ozon')}
                disabled={testing !== null || !form.ozon_client_id || !form.ozon_api_key}
              >
                {testing === 'ozon' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Проверить подключение
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Сохранить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
