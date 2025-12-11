import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Template, PrintFolder, GenerationStatus, Point } from '@/types';
import { templatesApi, foldersApi, generateApi } from '@/api/client';
import type { Template as ApiTemplate, PrintFolder as ApiFolder } from '@/api/client';
import { createDefaultPointSet, migrateOldFormat } from '@/utils/pointSetUtils';

// Debounce map for template updates
const templateUpdateTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const DEBOUNCE_DELAY = 300; // ms

// Debounced save function for template updates
function debouncedSaveTemplate(templateId: string, template: Template) {
  // Clear existing timer for this template
  const existingTimer = templateUpdateTimers.get(templateId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  // Set new timer
  const timer = setTimeout(() => {
    templateUpdateTimers.delete(templateId);
    
    // Convert to API format and save - send full template data
    templatesApi.update(templateId, {
      points: template.points?.map(p => ({ x: p.x, y: p.y })),
      pointSets: template.pointSets?.map(ps => ({
        index: ps.index,
        points: ps.points.map(p => ({ x: p.x, y: p.y })),
      })),
      isMultiMode: template.isMultiMode,
      cornerRadius: template.cornerRadius,
      blendStrength: template.blendStrength,
      changeBackgroundColor: template.changeBackgroundColor,
      addProduct: template.addProduct,
    }).catch(console.error);
  }, DEBOUNCE_DELAY);
  
  templateUpdateTimers.set(templateId, timer);
}

// Convert API template to frontend format
function toFrontendTemplate(t: ApiTemplate): Template {
  // Convert point sets from API format if available
  const apiPointSets = t.point_sets?.map(ps => ({
    index: ps.index,
    points: ps.points.map(p => ({ x: p.x, y: p.y })) as [Point, Point, Point, Point],
  })) || [];
  
  // Use migrateOldFormat to handle both new and legacy formats
  const { pointSets, isMultiMode } = migrateOldFormat({
    points: t.points?.map(p => ({ x: p.x, y: p.y })),
    pointSets: apiPointSets.length > 0 ? apiPointSets : undefined,
    isMultiMode: t.is_multi_mode,
  });
  
  // Get the first point set's points for backward compatibility
  const points = pointSets.length > 0 
    ? pointSets[0].points 
    : t.points.map(p => ({ x: p.x, y: p.y })) as [Point, Point, Point, Point];
  
  return {
    id: t.id,
    name: t.name,
    path: t.path,
    thumbnailUrl: templatesApi.getThumbnailUrl(t.id),
    points: points,
    pointSets: pointSets,
    isMultiMode: t.is_multi_mode ?? isMultiMode,
    cornerRadius: t.corner_radius,
    blendStrength: t.blend_strength,
    changeBackgroundColor: t.change_background_color,
    addProduct: t.add_product,
    originalWidth: t.original_width || 0,
    originalHeight: t.original_height || 0,
  };
}

// Convert API folder to frontend format
function toFrontendFolder(f: ApiFolder): PrintFolder {
  return {
    id: f.id,
    path: f.path,
    name: f.name,
    fileCount: f.file_count,
  };
}

interface AppState {
  // Templates
  templates: Template[];
  selectedTemplateId: string | null;
  isLoading: boolean;
  
  // Point set state
  activePointSetIndex: number;
  
  // API actions
  fetchTemplates: () => Promise<void>;
  uploadTemplate: (file: File) => Promise<Template>;
  removeTemplate: (id: string) => Promise<void>;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  selectTemplate: (id: string | null) => void;
  updatePoints: (id: string, points: [Point, Point, Point, Point]) => void;
  
  // Point set actions
  addPointSet: (templateId: string) => void;
  removePointSet: (templateId: string, pointSetIndex: number) => void;
  setActivePointSet: (index: number) => void;
  setMultiMode: (templateId: string, isMultiMode: boolean) => void;
  updatePointSet: (templateId: string, pointSetIndex: number, points: [Point, Point, Point, Point]) => void;
  
  // Folders
  folders: PrintFolder[];
  fetchFolders: () => Promise<void>;
  addFolder: (path: string) => Promise<PrintFolder>;
  addFolders: (paths: string[]) => Promise<{ added: PrintFolder[]; addedCount: number; skippedCount: number }>;
  removeFolder: (id: string) => Promise<void>;
  
  // Generation
  generationStatus: GenerationStatus;
  startGeneration: () => Promise<void>;
  stopGeneration: () => Promise<void>;
  pollStatus: () => Promise<void>;
  resetGeneration: () => Promise<void>;
  
  // Preview
  previewPrintFile: string | null;
  setPreviewPrintFile: (file: string | null) => void;
  
  // Editor
  selectedPoint: 'tl' | 'tr' | 'br' | 'bl' | null;
  setSelectedPoint: (point: 'tl' | 'tr' | 'br' | 'bl' | null) => void;
  moveStep: number;
  setMoveStep: (step: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Templates
      templates: [],
      selectedTemplateId: null,
      isLoading: false,
      
      // Point set state
      activePointSetIndex: 0,
      
      fetchTemplates: async () => {
        set({ isLoading: true });
        try {
          const data = await templatesApi.getAll();
          set({ templates: data.map(toFrontendTemplate) });
        } finally {
          set({ isLoading: false });
        }
      },
      
      uploadTemplate: async (file: File) => {
        const data = await templatesApi.upload(file);
        const template = toFrontendTemplate(data);
        set((state) => ({
          templates: [...state.templates, template].slice(0, 10),
        }));
        return template;
      },
      
      removeTemplate: async (id: string) => {
        await templatesApi.delete(id);
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
          selectedTemplateId: state.selectedTemplateId === id ? null : state.selectedTemplateId,
        }));
      },
      
      updateTemplate: (id: string, updates: Partial<Template>) => {
        // Update local state immediately for smooth UI
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
        
        // Debounced save to API for persistence
        const template = get().templates.find(t => t.id === id);
        if (template) {
          debouncedSaveTemplate(id, template);
        }
      },
      
      selectTemplate: (id) => set({ selectedTemplateId: id }),
      
      updatePoints: (id, points) => {
        const { activePointSetIndex } = get();
        // Update local state immediately for smooth UI
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.id !== id) return t;
            
            // Update the active point set's points
            const updatedPointSets = t.pointSets.map((ps, idx) =>
              idx === activePointSetIndex ? { ...ps, points } : ps
            );
            
            // Also update legacy points field with first point set
            const legacyPoints = activePointSetIndex === 0 ? points : t.points;
            
            return { ...t, points: legacyPoints, pointSets: updatedPointSets };
          }),
        }));
        
        // Get updated template for API call
        const template = get().templates.find(t => t.id === id);
        if (template) {
          // Save to API immediately (no debounce - important for persistence)
          templatesApi.update(id, { 
            points: template.points,
            pointSets: template.pointSets.map(ps => ({
              index: ps.index,
              points: ps.points.map(p => ({ x: p.x, y: p.y })),
            })),
          }).catch(() => {});
        }
      },
      
      // Point set actions
      addPointSet: (templateId) => {
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.id !== templateId) return t;
            
            // Get the last point set to use as base for offset
            const lastPointSet = t.pointSets[t.pointSets.length - 1];
            const newIndex = t.pointSets.length;
            
            // Create new point set with offset from last one
            const newPointSet = createDefaultPointSet(
              newIndex,
              lastPointSet?.points
            );
            
            return {
              ...t,
              pointSets: [...t.pointSets, newPointSet],
            };
          }),
        }));
        
        // Save to API
        const template = get().templates.find(t => t.id === templateId);
        if (template) {
          templatesApi.update(templateId, {
            pointSets: template.pointSets.map(ps => ({
              index: ps.index,
              points: ps.points.map(p => ({ x: p.x, y: p.y })),
            })),
          }).catch(() => {});
        }
      },
      
      removePointSet: (templateId, pointSetIndex) => {
        const { activePointSetIndex } = get();
        
        set((state) => {
          const template = state.templates.find(t => t.id === templateId);
          if (!template || template.pointSets.length <= 1) {
            // Cannot remove the last point set
            return state;
          }
          
          // Remove the point set and reindex remaining ones
          const updatedPointSets = template.pointSets
            .filter((_, idx) => idx !== pointSetIndex)
            .map((ps, idx) => ({ ...ps, index: idx }));
          
          // Update legacy points field with first point set
          const legacyPoints = updatedPointSets[0]?.points || template.points;
          
          // Adjust active point set index if needed
          let newActiveIndex = activePointSetIndex;
          if (pointSetIndex <= activePointSetIndex) {
            newActiveIndex = Math.max(0, activePointSetIndex - 1);
          }
          if (newActiveIndex >= updatedPointSets.length) {
            newActiveIndex = updatedPointSets.length - 1;
          }
          
          return {
            ...state,
            activePointSetIndex: newActiveIndex,
            templates: state.templates.map((t) =>
              t.id === templateId
                ? { ...t, points: legacyPoints, pointSets: updatedPointSets }
                : t
            ),
          };
        });
        
        // Save to API
        const template = get().templates.find(t => t.id === templateId);
        if (template) {
          templatesApi.update(templateId, {
            points: template.points,
            pointSets: template.pointSets.map(ps => ({
              index: ps.index,
              points: ps.points.map(p => ({ x: p.x, y: p.y })),
            })),
          }).catch(() => {});
        }
      },
      
      setActivePointSet: (index) => {
        set({ activePointSetIndex: index });
      },
      
      setMultiMode: (templateId, isMultiMode) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === templateId ? { ...t, isMultiMode } : t
          ),
        }));
        
        // Save to API
        templatesApi.update(templateId, { isMultiMode }).catch(() => {});
      },
      
      updatePointSet: (templateId, pointSetIndex, points) => {
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.id !== templateId) return t;
            
            const updatedPointSets = t.pointSets.map((ps, idx) =>
              idx === pointSetIndex ? { ...ps, points } : ps
            );
            
            // Update legacy points field if updating first point set
            const legacyPoints = pointSetIndex === 0 ? points : t.points;
            
            return { ...t, points: legacyPoints, pointSets: updatedPointSets };
          }),
        }));
        
        // Save to API
        const template = get().templates.find(t => t.id === templateId);
        if (template) {
          templatesApi.update(templateId, {
            points: template.points,
            pointSets: template.pointSets.map(ps => ({
              index: ps.index,
              points: ps.points.map(p => ({ x: p.x, y: p.y })),
            })),
          }).catch(() => {});
        }
      },
      
      // Folders
      folders: [],
      
      fetchFolders: async () => {
        const data = await foldersApi.getAll();
        set({ folders: data.map(toFrontendFolder) });
      },
      
      addFolder: async (path: string) => {
        const data = await foldersApi.add(path);
        const folder = toFrontendFolder(data);
        set((state) => ({
          folders: [...state.folders, folder],
        }));
        return folder;
      },
      
      addFolders: async (paths: string[]) => {
        const data = await foldersApi.addMultiple(paths);
        const addedFolders = data.added.map(toFrontendFolder);
        set((state) => ({
          folders: [...state.folders, ...addedFolders],
        }));
        return {
          added: addedFolders,
          addedCount: data.added_count,
          skippedCount: data.skipped_count,
        };
      },
      
      removeFolder: async (id: string) => {
        await foldersApi.delete(id);
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
        }));
      },
      
      // Generation
      generationStatus: {
        isRunning: false,
        current: 0,
        total: 0,
        errors: [],
      },
      
      startGeneration: async () => {
        const { templates, folders } = get();
        await generateApi.start(
          templates.map(t => t.id),
          folders.map(f => f.id)
        );
        set({
          generationStatus: {
            isRunning: true,
            current: 0,
            total: 0,
            errors: [],
          },
        });
      },
      
      stopGeneration: async () => {
        await generateApi.stop();
      },
      
      pollStatus: async () => {
        const status = await generateApi.getStatus();
        set({
          generationStatus: {
            isRunning: status.is_running,
            current: status.current,
            total: status.total,
            errors: status.errors,
          },
        });
      },
      
      resetGeneration: async () => {
        await generateApi.reset();
        set({
          generationStatus: {
            isRunning: false,
            current: 0,
            total: 0,
            errors: [],
          },
        });
      },
      
      // Preview
      previewPrintFile: null,
      setPreviewPrintFile: (file) => set({ previewPrintFile: file }),
      
      // Editor
      selectedPoint: null,
      setSelectedPoint: (point) => set({ selectedPoint: point }),
      moveStep: 5,
      setMoveStep: (step) => set({ moveStep: step }),
    }),
    {
      name: 'card-generator-store',
      partialize: (state) => ({
        moveStep: state.moveStep,
      }),
    }
  )
);
