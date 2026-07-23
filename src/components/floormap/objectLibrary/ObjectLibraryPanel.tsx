/**
 * ObjectLibraryPanel - Shared object picker for Floor Plan and Elevation views
 *
 * Features:
 * - Category-based organization
 * - Search functionality
 * - Preview of symbols
 * - Drag-to-place or click-to-select
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plug, Droplets, Sofa, ChevronDown, ChevronRight, ChefHat, PencilRuler } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { UnifiedObjectDefinition, ObjectCategory } from './types';
import { ELECTRICAL_OBJECTS } from './definitions/electrical';
import { KITCHEN_OBJECTS } from './definitions/kitchen';
import { PLUMBING_OBJECTS } from './definitions/plumbing';
import { FURNITURE_OBJECTS } from './definitions/furniture';
import { CUSTOM_OBJECTS } from './definitions/custom';

// Category configuration
const CATEGORIES: Array<{
  id: ObjectCategory;
  nameKey: string;
  icon: React.ReactNode;
  objects: UnifiedObjectDefinition[];
}> = [
  {
    id: 'electrical',
    nameKey: 'objectLibrary.categories.electrical',
    icon: <Plug className="h-4 w-4" />,
    objects: ELECTRICAL_OBJECTS,
  },
  {
    id: 'kitchen',
    nameKey: 'objectLibrary.categories.kitchen',
    icon: <ChefHat className="h-4 w-4" />,
    objects: KITCHEN_OBJECTS,
  },
  {
    id: 'plumbing',
    nameKey: 'objectLibrary.categories.plumbing',
    icon: <Droplets className="h-4 w-4" />,
    objects: PLUMBING_OBJECTS,
  },
  {
    id: 'furniture',
    nameKey: 'objectLibrary.categories.furniture',
    icon: <Sofa className="h-4 w-4" />,
    objects: FURNITURE_OBJECTS,
  },
  {
    id: 'custom',
    nameKey: 'objectLibrary.categories.custom',
    icon: <PencilRuler className="h-4 w-4" />,
    objects: CUSTOM_OBJECTS,
  },
];

interface ObjectLibraryPanelProps {
  /** Callback when object is selected */
  onSelectObject: (definition: UnifiedObjectDefinition) => void;
  /** Currently selected object ID */
  selectedObjectId?: string;
  /** View mode for showing appropriate symbol */
  viewMode?: 'floorplan' | 'elevation';
  /** Optional className */
  className?: string;
}

/**
 * Render SVG preview of object symbol
 */
const ObjectPreview: React.FC<{
  definition: UnifiedObjectDefinition;
  viewMode: 'floorplan' | 'elevation';
  isSelected: boolean;
}> = ({ definition, viewMode, isSelected }) => {
  const symbol = viewMode === 'elevation'
    ? definition.elevationSymbol
    : definition.floorPlanSymbol;

  return (
    <svg
      viewBox={symbol.viewBox}
      className={cn(
        "w-full h-full",
        isSelected ? "text-blue-600" : "text-gray-700"
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {symbol.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.fill === '#374151' ? 'currentColor' : (path.fill || 'none')}
          stroke={path.stroke === '#374151' ? 'currentColor' : (path.stroke || 'currentColor')}
          strokeWidth={path.strokeWidth || 2}
        />
      ))}
    </svg>
  );
};

export const ObjectLibraryPanel: React.FC<ObjectLibraryPanelProps> = ({
  onSelectObject,
  selectedObjectId,
  viewMode = 'floorplan',
  className,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['electrical']) // Electrical expanded by default
  );

  // Filter objects based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return CATEGORIES;
    }

    const query = searchQuery.toLowerCase();
    return CATEGORIES.map(category => ({
      ...category,
      objects: category.objects.filter(obj =>
        obj.name.toLowerCase().includes(query) ||
        obj.tags.some(tag => tag.toLowerCase().includes(query))
      ),
    })).filter(category => category.objects.length > 0);
  }, [searchQuery]);

  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('objectLibrary.search', 'Sök objekt...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Categories and objects */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredCategories.map(category => (
            <div key={category.id} className="mb-2">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
              >
                {expandedCategories.has(category.id) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {category.icon}
                <span>{t(category.nameKey, category.id)}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {category.objects.length}
                </span>
              </button>

              {/* Objects grid */}
              {expandedCategories.has(category.id) && (
                <div className="grid grid-cols-3 gap-2 mt-2 px-1">
                  {category.objects.map(obj => {
                    const isSelected = selectedObjectId === obj.id;
                    return (
                      <button
                        key={obj.id}
                        onClick={() => onSelectObject(obj)}
                        draggable
                        onDragStart={(e) => {
                          // v2 canvas accepts drops of this type (click-to-place still works)
                          e.dataTransfer.setData('application/x-renofine-object', obj.id);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className={cn(
                          "flex flex-col items-center p-2 rounded-lg border-2 transition-all hover:bg-muted/50",
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-transparent hover:border-muted"
                        )}
                        title={obj.name}
                      >
                        {/* Symbol preview */}
                        <div className="w-10 h-10 mb-1">
                          <ObjectPreview
                            definition={obj}
                            viewMode={viewMode}
                            isSelected={isSelected}
                          />
                        </div>
                        {/* Name */}
                        <span className="text-xs text-center truncate w-full">
                          {obj.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {filteredCategories.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('objectLibrary.noResults', 'Inga objekt hittades')}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer with hint */}
      <div className="p-2 border-t text-xs text-muted-foreground text-center">
        {t('objectLibrary.hint', 'Klicka för att välja, dra för att placera')}
      </div>
    </div>
  );
};

export default ObjectLibraryPanel;
