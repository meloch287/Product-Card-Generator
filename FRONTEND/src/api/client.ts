// Use relative paths - Vite proxy handles routing to backend
const API_BASE = '';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Templates
export const templatesApi = {
  getAll: () => request<Template[]>('/api/templates'),
  
  upload: async (file: File): Promise<Template> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail);
    }
    
    return response.json();
  },
  
  update: (id: string, data: TemplateUpdateData) =>
    request<Template>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: data.name,
        points: data.points,
        point_sets: data.pointSets,
        is_multi_mode: data.isMultiMode,
        corner_radius: data.cornerRadius,
        blend_strength: data.blendStrength,
        change_background_color: data.changeBackgroundColor,
        add_product: data.addProduct,
      }),
    }),
  
  delete: (id: string) =>
    request<{ status: string }>(`/api/templates/${id}`, { method: 'DELETE' }),
  
  getThumbnailUrl: (id: string) => `${API_BASE}/api/templates/${id}/thumbnail`,
  
  getEditorImageUrl: (id: string) => `${API_BASE}/api/templates/${id}/editor-image`,
  
  getPreviewUrl: (id: string, printFile?: string) => {
    const params = printFile ? `?print_file=${encodeURIComponent(printFile)}` : '';
    return `${API_BASE}/api/templates/${id}/preview${params}`;
  },
  
  autoDetect: (id: string) =>
    request<Template>(`/api/templates/${id}/auto-detect`, { method: 'POST' }),
};

// Folders
export interface BrowseListResponse {
  current_path: string;
  parent_path: string | null;
  folders: { name: string; path: string; image_count: number }[];
  drives: string[];
}

export const foldersApi = {
  getAll: () => request<PrintFolder[]>('/api/folders'),
  
  add: (path: string) =>
    request<PrintFolder>('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  
  addMultiple: (paths: string[]) =>
    request<AddMultipleFoldersResponse>('/api/folders/add-multiple', {
      method: 'POST',
      body: JSON.stringify(paths),
    }),
  
  delete: (id: string) =>
    request<{ status: string }>(`/api/folders/${id}`, { method: 'DELETE' }),
  
  getFiles: (id: string) =>
    request<{ name: string; path: string }[]>(`/api/folders/${id}/files`),
  
  browse: () =>
    request<BrowseFoldersResponse>('/api/folders/browse', { method: 'POST' }),
  
  browseList: (path?: string) =>
    request<BrowseListResponse>(`/api/folders/browse-list${path ? `?path=${encodeURIComponent(path)}` : ''}`),
};

// Generation
export const generateApi = {
  start: (templateIds: string[], folderIds: string[]) =>
    request<{ status: string; task_id: string }>('/api/generate/start', {
      method: 'POST',
      body: JSON.stringify({
        template_ids: templateIds,
        folder_ids: folderIds,
      }),
    }),
  
  stop: () =>
    request<{ status: string }>('/api/generate/stop', { method: 'POST' }),
  
  getStatus: () => request<GenerationStatus>('/api/generate/status'),
  
  reset: () =>
    request<{ status: string }>('/api/generate/reset', { method: 'POST' }),
};

// Types (matching backend)
export interface Template {
  id: string;
  name: string;
  path: string;
  thumbnail_url: string;
  points: { x: number; y: number }[];
  point_sets?: PointSetData[];
  is_multi_mode?: boolean;
  corner_radius: number;
  blend_strength: number;
  change_background_color: boolean;
  add_product: boolean;
  original_width: number;
  original_height: number;
}

export interface PrintFolder {
  id: string;
  path: string;
  name: string;
  file_count: number;
}

export interface GenerationStatus {
  is_running: boolean;
  current: number;
  total: number;
  errors: { file: string; error: string }[];
  task_id?: string;
}

export interface BrowseFoldersResponse {
  paths: string[];
}

export interface SkippedFolder {
  path: string;
  reason: string;
}

export interface AddMultipleFoldersResponse {
  added: PrintFolder[];
  added_count: number;
  skipped: SkippedFolder[];
  skipped_count: number;
}

// Point set structure for multi-photo insertion
export interface PointSetData {
  index: number;
  points: { x: number; y: number }[];
}

// Frontend format for updates (camelCase)
export interface TemplateUpdateData {
  name?: string;
  points?: { x: number; y: number }[];
  pointSets?: PointSetData[];
  isMultiMode?: boolean;
  cornerRadius?: number;
  blendStrength?: number;
  changeBackgroundColor?: boolean;
  addProduct?: boolean;
}

// Inpainting API
export interface InpaintRequest {
  image: string;  // Base64 encoded image
  mask: string;   // Base64 encoded mask
  radius?: number;
}

export interface InpaintResponse {
  result: string;  // Base64 encoded result image
}

export const inpaintApi = {
  /**
   * Apply content-aware inpainting to an image.
   * @param image Base64 encoded image data (with or without data URL prefix)
   * @param mask Base64 encoded mask data (white = area to inpaint)
   * @param radius Inpainting radius (default: 3)
   */
  inpaint: (image: string, mask: string, radius?: number) =>
    request<InpaintResponse>('/api/inpaint', {
      method: 'POST',
      body: JSON.stringify({ image, mask, radius }),
    }),
};

// Save Image API
export interface SaveImageRequest {
  image: string;      // Base64 encoded image
  folder_path: string; // Folder path where to save
  filename: string;   // Original filename
  suffix?: string;    // Suffix to add before extension (default: "_edited")
}

export interface SaveImageResponse {
  success: boolean;
  path: string;       // Full path to saved file
  filename: string;   // Name of saved file
}

export const saveImageApi = {
  /**
   * Save an edited image to the specified folder.
   * @param image Base64 encoded image data
   * @param folderPath Folder path where to save the image
   * @param filename Original filename
   * @param suffix Optional suffix to add before extension
   */
  save: (image: string, folderPath: string, filename: string, suffix?: string) =>
    request<SaveImageResponse>('/api/save-image', {
      method: 'POST',
      body: JSON.stringify({
        image,
        folder_path: folderPath,
        filename,
        suffix,
      }),
    }),
};

// Marketplace Cards API
export type Marketplace = 'wildberries' | 'ozon';
export type CardStatus = 'draft' | 'ready' | 'published';

export interface MarketplaceCard {
  // Основная информация
  id: string;
  marketplace: Marketplace;
  status: CardStatus;
  
  // Товарная информация
  name: string;
  description: string;
  brand: string;
  article: string;
  barcode: string;
  
  // Категория и характеристики
  category_id: string;
  category_name: string;
  category_path: string[];
  characteristics: Record<string, any>;
  
  // Медиа
  images: string[];
  main_image_index: number;
  
  // Размеры и вес
  dimensions?: ProductDimensions;
  weight?: number;
  
  // Ценообразование
  price: number;
  old_price?: number;
  discount: number;
  cost_price?: number;
  
  // Логистика (для Ozon)
  warehouse_id?: string;
  stock_quantity?: number;
  
  // Метаданные
  marketplace_id?: string;
  moderation_status?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
  
  // Дополнительные данные
  seo_keywords: string[];
  tags: string[];
  notes: string;
  
  // Совместимость
  data: Record<string, unknown>;
}

export interface ProductDimensions {
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface CardCreateData {
  // Основная информация
  name: string;
  description: string;
  marketplace: Marketplace;
  brand: string;
  article: string;
  barcode: string;
  
  // Категория и характеристики
  category_id: string;
  category_name: string;
  category_path?: string[];
  characteristics?: Record<string, any>;
  
  // Медиа
  images: string[];
  main_image_index?: number;
  
  // Размеры и вес
  dimensions?: ProductDimensions;
  weight?: number;
  
  // Ценообразование
  price: number;
  old_price?: number;
  discount?: number;
  cost_price?: number;
  
  // Логистика (для Ozon)
  warehouse_id?: string;
  stock_quantity?: number;
  
  // Дополнительные данные
  seo_keywords?: string[];
  tags?: string[];
  notes?: string;
}

export interface CardUpdateData {
  name?: string;
  description?: string;
  status?: CardStatus;
  brand?: string;
  article?: string;
  barcode?: string;
  price?: number;
  old_price?: number;
  discount?: number;
  category_id?: string;
  category_name?: string;
  images?: string[];
  marketplace_id?: string;
  data?: Record<string, unknown>;
}

export const cardsApi = {
  getAll: (marketplace?: Marketplace, status?: CardStatus) => {
    const params = new URLSearchParams();
    if (marketplace) params.set('marketplace', marketplace);
    if (status) params.set('status', status);
    const query = params.toString();
    return request<MarketplaceCard[]>(`/api/cards${query ? `?${query}` : ''}`);
  },

  create: (data: CardCreateData) =>
    request<MarketplaceCard>('/api/cards', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: string) => request<MarketplaceCard>(`/api/cards/${id}`),

  update: (id: string, data: CardUpdateData) =>
    request<MarketplaceCard>(`/api/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ status: string }>(`/api/cards/${id}`, { method: 'DELETE' }),

  batchDelete: (ids: string[]) =>
    request<{ status: string; deleted: number; not_found: number }>('/api/cards/batch-delete', {
      method: 'POST',
      body: JSON.stringify(ids),
    }),

  addImages: (id: string, images: string[]) =>
    request<{ status: string; images_count: number }>(`/api/cards/${id}/images`, {
      method: 'POST',
      body: JSON.stringify(images),
    }),

  removeImage: (id: string, imageIndex: number) =>
    request<{ status: string; images_count: number }>(`/api/cards/${id}/images/${imageIndex}`, {
      method: 'DELETE',
    }),
};

// Marketplace API
export interface MarketplaceSettings {
  wb_api_key: string | null;
  ozon_client_id: string | null;
  ozon_api_key: string | null;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
}

export interface WBCategory {
  subjectID: number;
  parentID: number;
  subjectName: string;
  parentName: string;
}

export interface OzonCategory {
  description_category_id: number;
  category_name: string;
  children?: OzonCategory[];
}

export interface PublishRequest {
  card_id: string;
  subject_id?: number;  // WB
  category_id?: number; // Ozon
  dimensions?: { length: number; width: number; height: number };
  weight?: number;
  characteristics?: Array<{ id: number; value: string }>;
}

export const marketplaceApi = {
  // Settings
  getSettings: () => request<MarketplaceSettings>('/api/marketplace/settings'),

  updateSettings: (settings: Partial<MarketplaceSettings>) =>
    request<MarketplaceSettings>('/api/marketplace/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),

  testConnection: (marketplace: Marketplace) =>
    request<TestConnectionResponse>('/api/marketplace/test-connection', {
      method: 'POST',
      body: JSON.stringify({ marketplace }),
    }),

  // Wildberries
  getWBCategories: () =>
    request<{ categories: WBCategory[] }>('/api/marketplace/wb/categories'),

  searchWBCategories: (query: string, limit = 50) =>
    request<{ categories: WBCategory[] }>('/api/marketplace/wb/categories/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    }),

  getWBCharacteristics: (subjectId: number) =>
    request<{ characteristics: Array<{ id: number; name: string; required: boolean }> }>(
      `/api/marketplace/wb/categories/${subjectId}/characteristics`
    ),

  getWBErrors: () =>
    request<{ errors: Array<{ vendorCode: string; errors: string[] }> }>('/api/marketplace/wb/errors'),

  // Ozon
  getOzonCategories: () =>
    request<{ categories: OzonCategory[] }>('/api/marketplace/ozon/categories'),

  getOzonAttributes: (categoryId: number) =>
    request<{ attributes: Array<{ id: number; name: string; is_required: boolean }> }>(
      `/api/marketplace/ozon/categories/${categoryId}/attributes`
    ),

  getOzonWarehouses: () =>
    request<{ warehouses: Array<{ warehouse_id: number; name: string }> }>('/api/marketplace/ozon/warehouses'),

  // Publish
  publish: (data: PublishRequest) =>
    request<{ success: boolean; message: string; result?: unknown }>('/api/marketplace/publish', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
