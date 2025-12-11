import { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { PointControls } from './PointControls';
import { SettingsPanel } from './SettingsPanel';
import { PointSetList } from './PointSetList';
import { POINT_COLORS, type PointType, type Point } from '@/types';
import { toast } from 'sonner';
import { Target, Crosshair, Loader2 } from 'lucide-react';
import { templatesApi } from '@/api/client';
import { 
  getPointSetColor, 
  createDefaultPointSet,
  MAX_POINT_SETS 
} from '@/utils/pointSetUtils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
const POINT_RADIUS = 14;

export function PointEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [imgRect, setImgRect] = useState({ width: 0, height: 0, left: 0, top: 0 });
  
  // Multi-mode state management (Requirements 3.1, 3.2)
  const [activePointSetIndex, setActivePointSetIndex] = useState(0);

  const { templates, selectedTemplateId, updateTemplate, selectedPoint, setSelectedPoint, moveStep } = useAppStore();
  const template = useMemo(() => templates.find(t => t.id === selectedTemplateId), [templates, selectedTemplateId]);
  
  // Get current point sets - ensure we always have at least one
  const pointSets = useMemo(() => {
    if (!template) return [];
    if (template.pointSets && template.pointSets.length > 0) {
      return template.pointSets;
    }
    // Fallback: create point set from legacy points
    return [{
      index: 0,
      points: template.points
    }];
  }, [template]);
  
  // Get active point set
  const activePointSet = useMemo(() => {
    return pointSets.find(ps => ps.index === activePointSetIndex) || pointSets[0];
  }, [pointSets, activePointSetIndex]);
  
  // Reset active index when template changes or if current index is invalid
  useEffect(() => {
    if (pointSets.length > 0) {
      const validIndex = pointSets.some(ps => ps.index === activePointSetIndex);
      if (!validIndex) {
        setActivePointSetIndex(pointSets[0]?.index ?? 0);
      }
    }
  }, [pointSets, activePointSetIndex]);

  // Update image rect
  const updateImgRect = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.complete || !img.naturalWidth) return;
    
    const containerRect = container.getBoundingClientRect();
    const imgBounds = img.getBoundingClientRect();
    
    if (imgBounds.width > 0 && imgBounds.height > 0) {
      setImgRect({
        width: imgBounds.width,
        height: imgBounds.height,
        left: imgBounds.left - containerRect.left,
        top: imgBounds.top - containerRect.top,
      });
    }
  }, []);

  // Calculate point position on screen
  const getPointScreenPos = useCallback((ix: number, iy: number) => {
    if (!template || !imgRect.width) return { x: 0, y: 0 };
    
    const origW = template.originalWidth || 1;
    const origH = template.originalHeight || 1;
    
    const scaleX = imgRect.width / origW;
    const scaleY = imgRect.height / origH;
    
    return {
      x: imgRect.left + ix * scaleX,
      y: imgRect.top + iy * scaleY,
    };
  }, [template, imgRect]);

  // Convert screen position to original image coords
  const screenToImageCoords = useCallback((sx: number, sy: number) => {
    if (!template || !imgRect.width) return { x: 0, y: 0 };
    
    const origW = template.originalWidth || 1;
    const origH = template.originalHeight || 1;
    
    const scaleX = imgRect.width / origW;
    const scaleY = imgRect.height / origH;
    
    return {
      x: Math.round((sx - imgRect.left) / scaleX),
      y: Math.round((sy - imgRect.top) / scaleY),
    };
  }, [template, imgRect]);

  // Reset when template changes
  useEffect(() => {
    setImgLoaded(false);
    setImgRect({ width: 0, height: 0, left: 0, top: 0 });
    setActivePointSetIndex(0);
  }, [template?.id]);
  
  // Handle mode toggle (Requirements 1.1, 1.4, 1.5)
  const handleModeToggle = useCallback((isMulti: boolean) => {
    if (!template || !selectedTemplateId) return;
    
    // Preserve data when switching modes
    const currentPointSets = pointSets.length > 0 ? pointSets : [{
      index: 0,
      points: template.points
    }];
    
    updateTemplate(selectedTemplateId, {
      isMultiMode: isMulti,
      pointSets: currentPointSets,
    });
    
    // Save to API
    templatesApi.update(selectedTemplateId, {
      isMultiMode: isMulti,
      pointSets: currentPointSets,
    }).catch(console.error);
  }, [template, selectedTemplateId, pointSets, updateTemplate]);
  
  // Handle adding a new point set (Requirements 2.1, 2.2, 2.3, 2.4)
  const handleAddPointSet = useCallback(() => {
    if (!template || !selectedTemplateId) return;
    if (pointSets.length >= MAX_POINT_SETS) return;
    
    // Find the next available index
    const existingIndices = new Set(pointSets.map(ps => ps.index));
    let newIndex = 0;
    while (existingIndices.has(newIndex)) {
      newIndex++;
    }
    
    // Get base points from the last point set for offset calculation
    const lastPointSet = pointSets[pointSets.length - 1];
    const newPointSet = createDefaultPointSet(newIndex, lastPointSet?.points);
    
    const newPointSets = [...pointSets, newPointSet];
    
    updateTemplate(selectedTemplateId, {
      pointSets: newPointSets,
    });
    
    // Set the new point set as active
    setActivePointSetIndex(newIndex);
    
    // Save to API
    templatesApi.update(selectedTemplateId, {
      pointSets: newPointSets,
    }).catch(console.error);
  }, [template, selectedTemplateId, pointSets, updateTemplate]);
  
  // Handle removing a point set (Requirements 3.5, 3.6)
  const handleRemovePointSet = useCallback((indexToRemove: number) => {
    if (!template || !selectedTemplateId) return;
    if (pointSets.length <= 1) return; // Cannot remove last point set
    
    const newPointSets = pointSets
      .filter(ps => ps.index !== indexToRemove)
      .map((ps, i) => ({ ...ps, index: i })); // Reindex
    
    updateTemplate(selectedTemplateId, {
      pointSets: newPointSets,
    });
    
    // Update active index if needed
    if (activePointSetIndex === indexToRemove) {
      setActivePointSetIndex(newPointSets[0]?.index ?? 0);
    } else if (activePointSetIndex > indexToRemove) {
      // Adjust active index due to reindexing
      setActivePointSetIndex(activePointSetIndex - 1);
    }
    
    // Save to API
    templatesApi.update(selectedTemplateId, {
      pointSets: newPointSets,
    }).catch(console.error);
  }, [template, selectedTemplateId, pointSets, activePointSetIndex, updateTemplate]);
  
  // Handle selecting a point set
  const handleSelectPointSet = useCallback((index: number) => {
    setActivePointSetIndex(index);
    setSelectedPoint(null); // Clear point selection when switching sets
  }, [setSelectedPoint]);

  // Update rect on resize - use useLayoutEffect for synchronous update
  useLayoutEffect(() => {
    if (!imgLoaded) return;
    
    const handleResize = () => {
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        updateImgRect();
      });
    };
    
    // Initial update
    handleResize();
    
    // Observe both container and image
    const container = containerRef.current;
    const img = imgRef.current;
    const obs = new ResizeObserver(handleResize);
    
    if (container) {
      obs.observe(container);
    }
    if (img) {
      obs.observe(img);
    }
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [imgLoaded, updateImgRect]);

  // Mouse handlers
  const getMousePos = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // Find point at position - searches active set first, then others (Requirements 3.2, 3.3)
  // This ensures that when points overlap, the active set's points take priority
  const findPointAtPos = useCallback((x: number, y: number): { pointIndex: number; setIndex: number } | null => {
    if (!template || pointSets.length === 0) return null;
    
    // First, search in active point set (priority for active set)
    if (activePointSet) {
      for (let i = 0; i < 4; i++) {
        const p = getPointScreenPos(activePointSet.points[i].x, activePointSet.points[i].y);
        if (Math.hypot(x - p.x, y - p.y) <= POINT_RADIUS + 8) {
          return { pointIndex: i, setIndex: activePointSet.index };
        }
      }
    }
    
    // Then search in other point sets (for clicking to switch active set)
    for (const ps of pointSets) {
      if (ps.index === activePointSetIndex) continue;
      for (let i = 0; i < 4; i++) {
        const p = getPointScreenPos(ps.points[i].x, ps.points[i].y);
        if (Math.hypot(x - p.x, y - p.y) <= POINT_RADIUS + 8) {
          return { pointIndex: i, setIndex: ps.index };
        }
      }
    }
    
    return null;
  }, [template, pointSets, activePointSet, activePointSetIndex, getPointScreenPos]);

  // Mouse down handler - Requirements 3.2, 3.3
  // Click on inactive set point switches active set
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getMousePos(e);
    const result = findPointAtPos(pos.x, pos.y);
    if (result !== null) {
      // If clicking on a different point set, switch to it (Requirements 3.3)
      if (result.setIndex !== activePointSetIndex) {
        setActivePointSetIndex(result.setIndex);
      }
      // Start dragging and select the point
      setDragging(result.pointIndex);
      setSelectedPoint(['tl', 'tr', 'br', 'bl'][result.pointIndex] as PointType);
    }
  }, [getMousePos, findPointAtPos, activePointSetIndex, setSelectedPoint]);

  // Mouse move handler - Requirements 3.2, 3.3
  // Drag operations affect only active set points
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging === null || !template || !selectedTemplateId) return;
    const pos = getMousePos(e);
    const imgCoords = screenToImageCoords(pos.x, pos.y);
    
    // Update only the active point set's points (Requirements 3.2)
    const newPointSets = pointSets.map(ps => {
      if (ps.index === activePointSetIndex) {
        const newPoints = [...ps.points] as [Point, Point, Point, Point];
        newPoints[dragging] = { x: imgCoords.x, y: imgCoords.y };
        return { ...ps, points: newPoints };
      }
      return ps;
    });
    
    // Also update legacy points field for backward compatibility
    const activeSet = newPointSets.find(ps => ps.index === activePointSetIndex);
    const legacyPoints = activeSet?.points || template.points;
    
    updateTemplate(selectedTemplateId, {
      pointSets: newPointSets,
      points: legacyPoints,
    });
  }, [dragging, template, selectedTemplateId, getMousePos, screenToImageCoords, pointSets, activePointSetIndex, updateTemplate]);

  const onMouseUp = useCallback(() => setDragging(null), []);

  // Keyboard navigation - Requirements 3.4
  // Arrow keys move selected point of active set only with exact step precision
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedPoint || !template || !selectedTemplateId || !activePointSet) return;
      const idx = ['tl', 'tr', 'br', 'bl'].indexOf(selectedPoint);
      if (idx === -1) return;
      
      // Calculate movement delta based on arrow key (Requirements 3.4)
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -moveStep;
      else if (e.key === 'ArrowRight') dx = moveStep;
      else if (e.key === 'ArrowUp') dy = -moveStep;
      else if (e.key === 'ArrowDown') dy = moveStep;
      else return;
      
      e.preventDefault();
      
      // Update only the active point set's points (active set isolation)
      const newPointSets = pointSets.map(ps => {
        if (ps.index === activePointSetIndex) {
          const newPoints = [...ps.points] as [Point, Point, Point, Point];
          // Apply exact step movement (Requirements 3.4)
          newPoints[idx] = { x: newPoints[idx].x + dx, y: newPoints[idx].y + dy };
          return { ...ps, points: newPoints };
        }
        return ps;
      });
      
      // Also update legacy points field for backward compatibility
      const activeSet = newPointSets.find(ps => ps.index === activePointSetIndex);
      const legacyPoints = activeSet?.points || template.points;
      
      updateTemplate(selectedTemplateId, {
        pointSets: newPointSets,
        points: legacyPoints,
      });
      
      // Save to API
      templatesApi.update(selectedTemplateId, {
        pointSets: newPointSets,
        points: legacyPoints,
      }).catch(console.error);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPoint, template, selectedTemplateId, moveStep, pointSets, activePointSetIndex, activePointSet, updateTemplate]);

  const onSave = useCallback(async () => {
    if (!template) return;
    try {
      await templatesApi.update(template.id, {
        points: template.points,
        pointSets: pointSets,
        isMultiMode: template.isMultiMode,
        cornerRadius: template.cornerRadius,
        blendStrength: template.blendStrength,
        changeBackgroundColor: template.changeBackgroundColor,
        addProduct: template.addProduct,
      });
      toast.success('Сохранено');
    } catch (e: any) { toast.error(e.message); }
  }, [template, pointSets]);

  const onAutoDetect = useCallback(async () => {
    if (!template || !selectedTemplateId) return;
    try {
      const updated = await templatesApi.autoDetect(template.id);
      // Points come as array of {x, y} objects from API
      if (updated.points && Array.isArray(updated.points) && updated.points.length === 4) {
        const newPoints = updated.points.map(p => ({ 
          x: Number(p.x), 
          y: Number(p.y) 
        })) as [Point, Point, Point, Point];
        
        // Update local state only (server already saved in auto-detect endpoint)
        const { updateTemplate } = useAppStore.getState();
        updateTemplate(selectedTemplateId, { points: newPoints });
        toast.success('Точки определены автоматически');
      } else {
        toast.error('Не удалось определить точки');
      }
    } catch (e: any) { 
      toast.error(`Ошибка автодетекта: ${e.message}`); 
    }
  }, [template, selectedTemplateId]);

  const imageUrl = template ? `${templatesApi.getEditorImageUrl(template.id)}?v=${template.id}` : null;
  const canRenderPoints = imgLoaded && imgRect.width > 0;

  // SVG lines - render for all point sets with distinct colors (Requirements 4.4)
  const renderLines = () => {
    if (!template || !canRenderPoints) return null;
    
    // In single mode, only render the first point set
    const setsToRender = template.isMultiMode ? pointSets : pointSets.slice(0, 1);
    
    return (
      <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
        {setsToRender.map((ps) => {
          const pts = ps.points.map(p => getPointScreenPos(p.x, p.y));
          const pathD = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y} L ${pts[3].x} ${pts[3].y} Z`;
          const color = getPointSetColor(ps.index);
          const isActive = ps.index === activePointSetIndex;
          const opacity = isActive ? 0.8 : 0.4; // Dim inactive sets (Requirements 4.3)
          
          return (
            <path 
              key={`line-${ps.index}`}
              d={pathD} 
              fill="none" 
              stroke={color} 
              strokeWidth={isActive ? 2.5 : 2} 
              strokeDasharray="6 4"
              opacity={opacity}
            />
          );
        })}
      </svg>
    );
  };

  // Render points for all point sets (Requirements 4.2, 4.3, 4.5)
  const renderPoints = () => {
    if (!template || !canRenderPoints) return null;
    const labels = ['TL', 'TR', 'BR', 'BL'];
    const types: PointType[] = ['tl', 'tr', 'br', 'bl'];
    
    // In single mode, only render the first point set
    const setsToRender = template.isMultiMode ? pointSets : pointSets.slice(0, 1);

    return setsToRender.flatMap((ps) => {
      const setColor = getPointSetColor(ps.index);
      const isActiveSet = ps.index === activePointSetIndex;
      const setOpacity = isActiveSet ? 1 : 0.5; // 50% opacity for inactive sets (Requirements 4.3)
      
      return ps.points.map((point, i) => {
        const pos = getPointScreenPos(point.x, point.y);
        const isSelectedPoint = isActiveSet && selectedPoint === types[i];
        
        // Use set color for all points in multi-mode, original colors in single mode
        const pointColor = template.isMultiMode ? setColor : [POINT_COLORS.tl, POINT_COLORS.tr, POINT_COLORS.br, POINT_COLORS.bl][i];
        
        // Tooltip text for inactive points (Requirements 4.5)
        const tooltipText = `Область ${ps.index + 1}: ${labels[i]}`;
        
        const pointElement = (
          <div
            key={`${ps.index}-${types[i]}`}
            className={isActiveSet ? "absolute pointer-events-none" : "absolute pointer-events-auto cursor-pointer"}
            style={{ 
              left: pos.x, 
              top: pos.y, 
              transform: 'translate(-50%, -50%)',
              opacity: setOpacity,
              zIndex: isActiveSet ? 10 : 5, // Active set on top
            }}
          >
            <div
              className="absolute rounded-full"
              style={{
                width: POINT_RADIUS * 2 + 16,
                height: POINT_RADIUS * 2 + 16,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: pointColor,
                opacity: isSelectedPoint ? 0.4 : 0.25,
                filter: `blur(${isSelectedPoint ? 12 : 8}px)`,
              }}
            />
            <div
              className="rounded-full border-2"
              style={{
                width: isActiveSet ? POINT_RADIUS * 2 : POINT_RADIUS * 1.6, // Larger for active set (Requirements 4.2)
                height: isActiveSet ? POINT_RADIUS * 2 : POINT_RADIUS * 1.6,
                backgroundColor: pointColor,
                borderColor: isSelectedPoint ? '#fff' : '#000',
                borderWidth: isSelectedPoint ? 3 : 2,
                boxShadow: `0 0 ${isSelectedPoint ? 20 : 12}px ${pointColor}`,
              }}
            />
            <span
              className="absolute text-[10px] font-bold whitespace-nowrap"
              style={{ color: pointColor, left: POINT_RADIUS + 8, top: -POINT_RADIUS - 4 }}
            >
              {template.isMultiMode ? `${ps.index + 1}.${labels[i]}` : labels[i]}
            </span>
          </div>
        );
        
        // Wrap inactive points with tooltip (Requirements 4.5)
        if (!isActiveSet && template.isMultiMode) {
          return (
            <TooltipProvider key={`tooltip-${ps.index}-${types[i]}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {pointElement}
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tooltipText}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        
        return pointElement;
      });
    });
  };

  if (!template) return (
    <div className="panel h-full flex items-center justify-center">
      <Crosshair className="w-10 h-10 text-muted-foreground/30" />
    </div>
  );

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <div className="panel-header-icon"><Target className="w-4 h-4 text-primary-foreground" /></div>
        <span className="font-semibold">Редактор точек</span>
        <span className="text-muted-foreground text-xs ml-2">{template.name}</span>
      </div>

      <div 
        ref={containerRef} 
        className="flex-1 bg-background/50 rounded-xl overflow-hidden relative flex items-center justify-center cyber-grid"
        style={{ minHeight: 350, cursor: dragging !== null ? 'grabbing' : 'crosshair' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {imageUrl && (
          <img
            ref={imgRef}
            src={imageUrl}
            alt={template.name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
            style={{ maxHeight: 'calc(100% - 20px)' }}
            draggable={false}
            onLoad={() => {
              setImgLoaded(true);
              // Delay to ensure browser has rendered the image
              setTimeout(updateImgRect, 0);
            }}
            onError={() => toast.error('Ошибка загрузки изображения')}
          />
        )}
        
        {renderLines()}
        {renderPoints()}
        
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
      </div>

      <div className="mt-3 space-y-3 overflow-y-auto max-h-[300px] pr-1">
        {/* Point Set List - only shown in multi-mode (Requirements 2.1, 3.1) */}
        {template.isMultiMode && (
          <div className="py-2 border-b border-border/50">
            <PointSetList
              pointSets={pointSets}
              activeIndex={activePointSetIndex}
              onSelect={handleSelectPointSet}
              onAdd={handleAddPointSet}
              onRemove={handleRemovePointSet}
            />
          </div>
        )}
        
        <PointControls onAutoDetect={onAutoDetect} onSave={onSave} />
        <SettingsPanel template={template} onModeToggle={handleModeToggle} />
      </div>
    </div>
  );
}
