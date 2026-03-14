/**
 * Screenshot management view for App Store Connect
 *
 * Allows selecting an app, browsing screenshots by device display type,
 * capturing new screenshots from the simulator, reordering via drag-and-drop,
 * and uploading to App Store Connect.
 *
 * @component
 * @returns {JSX.Element} Screenshot management interface
 */
import { useState, useCallback } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest, useListData } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@stevederico/skateboard-ui/shadcn/ui/tabs';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Progress } from '@stevederico/skateboard-ui/shadcn/ui/progress';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { Empty } from '@stevederico/skateboard-ui/shadcn/ui/empty';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Device display type options for App Store Connect screenshots */
const DISPLAY_TYPES = [
  { label: '6.7" Display', value: 'APP_IPHONE_67', width: 1290, height: 2796 },
  { label: '6.5" Display', value: 'APP_IPHONE_65', width: 1284, height: 2778 },
  { label: '5.5" Display', value: 'APP_IPHONE_55', width: 1242, height: 2208 },
  { label: '12.9" iPad', value: 'APP_IPAD_PRO_129', width: 2048, height: 2732 }
];

/**
 * Sortable screenshot thumbnail card using dnd-kit
 *
 * @component
 * @param {Object} props
 * @param {Object} props.screenshot - Screenshot data with id and url
 * @param {boolean} props.isSelected - Whether this screenshot is selected
 * @param {Function} props.onToggleSelect - Callback to toggle selection
 * @returns {JSX.Element} Draggable screenshot card
 */
function SortableScreenshot({ screenshot, isSelected, onToggleSelect }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: screenshot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className={`cursor-grab overflow-hidden transition-all active:cursor-grabbing ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
        onClick={() => onToggleSelect(screenshot.id)}
        role="button"
        tabIndex={0}
        aria-label={`Screenshot ${screenshot.id}${isSelected ? ', selected' : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleSelect(screenshot.id);
          }
        }}
      >
        <CardContent className="p-0">
          <div className="aspect-[9/19.5] bg-muted">
            {screenshot.url ? (
              <img
                src={screenshot.url}
                alt={`App screenshot ${screenshot.id}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No preview
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ScreenshotsView() {
  const [selectedApp, setSelectedApp] = useState('');
  const [activeTab, setActiveTab] = useState(DISPLAY_TYPES[0].value);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [screenshots, setScreenshots] = useState({});
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: apps, isLoading: isLoadingApps } = useListData('/asc/apps');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /** Screenshots for the currently active display type tab */
  const currentScreenshots = screenshots[activeTab] || [];

  /**
   * Fetch screenshots for the selected app and display type
   *
   * @param {string} appId - App Store Connect app identifier
   */
  async function fetchScreenshots(appId) {
    if (!appId) return;
    try {
      const result = await apiRequest(`/asc/apps/${appId}/screenshots`);
      if (result?.data) {
        const grouped = {};
        for (const type of DISPLAY_TYPES) {
          grouped[type.value] = (result.data || []).filter(
            (s) => s.attributes?.screenshotDisplayType === type.value
          );
        }
        setScreenshots(grouped);
      }
    } catch {
      toast.error('Failed to load screenshots');
    }
  }

  /**
   * Handle app selection change and fetch its screenshots
   *
   * @param {string} appId - Selected app identifier
   */
  function handleAppChange(appId) {
    setSelectedApp(appId);
    setSelectedIds(new Set());
    fetchScreenshots(appId);
  }

  /**
   * Toggle screenshot selection for upload
   *
   * @param {string} id - Screenshot identifier to toggle
   */
  const handleToggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /**
   * Handle drag-and-drop reorder of screenshots
   *
   * @param {Object} event - dnd-kit drag end event
   */
  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setScreenshots((prev) => {
      const items = [...(prev[activeTab] || [])];
      const oldIndex = items.findIndex((s) => s.id === active.id);
      const newIndex = items.findIndex((s) => s.id === over.id);
      return {
        ...prev,
        [activeTab]: arrayMove(items, oldIndex, newIndex)
      };
    });
  }

  /** Capture a new screenshot from the iOS simulator */
  async function handleCapture() {
    if (!selectedApp) {
      toast.error('Select an app first');
      return;
    }
    setIsCapturing(true);
    try {
      await apiRequest('/asc/screenshots/capture', {
        method: 'POST',
        body: JSON.stringify({
          appId: selectedApp,
          displayType: activeTab
        })
      });
      toast.success('Screenshot captured');
      await fetchScreenshots(selectedApp);
    } catch {
      toast.error('Failed to capture screenshot');
    } finally {
      setIsCapturing(false);
    }
  }

  /** Upload selected screenshots to App Store Connect */
  async function handleUpload() {
    if (selectedIds.size === 0) {
      toast.error('Select screenshots to upload');
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);

    const ids = [...selectedIds];
    try {
      for (let i = 0; i < ids.length; i++) {
        await apiRequest(`/asc/apps/${selectedApp}/screenshots/upload`, {
          method: 'POST',
          body: JSON.stringify({
            screenshotId: ids[i],
            displayType: activeTab
          })
        });
        setUploadProgress(Math.round(((i + 1) / ids.length) * 100));
      }
      toast.success(`Uploaded ${ids.length} screenshot${ids.length > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  return (
    <>
      <Header title="Screenshots" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4 md:p-6">
          {/* App selector */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app-select">App</Label>
              <Select value={selectedApp} onValueChange={handleAppChange}>
                <SelectTrigger id="app-select" className="w-64" aria-label="Select an app">
                  <SelectValue placeholder="Select an app" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingApps ? (
                    <SelectItem value="_loading" disabled>Loading...</SelectItem>
                  ) : (
                    apps?.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.attributes?.name || app.id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCapture}
                disabled={!selectedApp || isCapturing}
                aria-label="Capture screenshot from simulator"
              >
                {isCapturing ? 'Capturing...' : 'Capture'}
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!selectedApp || selectedIds.size === 0 || isUploading}
                aria-label="Upload selected screenshots to App Store Connect"
              >
                {isUploading ? 'Uploading...' : `Upload to ASC${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
              </Button>
            </div>
          </div>

          {/* Upload progress */}
          {isUploading && (
            <div className="flex items-center gap-3">
              <Progress value={uploadProgress} className="flex-1" aria-label="Upload progress" />
              <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
            </div>
          )}

          {!selectedApp && (
            <Empty
              title="Select an App"
              description="Choose an app from the dropdown above to manage its screenshots."
            />
          )}

          {selectedApp && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList aria-label="Device display types">
                {DISPLAY_TYPES.map((type) => (
                  <TabsTrigger key={type.value} value={type.value}>
                    {type.label}
                    {(screenshots[type.value]?.length || 0) > 0 && (
                      <Badge variant="secondary" className="ml-1.5 text-xs">
                        {screenshots[type.value].length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {DISPLAY_TYPES.map((type) => (
                <TabsContent key={type.value} value={type.value}>
                  {currentScreenshots.length === 0 ? (
                    <Empty
                      title="No Screenshots"
                      description={`No ${type.label} screenshots found. Use Capture to add screenshots from the simulator.`}
                    />
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={currentScreenshots.map((s) => s.id)}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                          {currentScreenshots.map((screenshot) => (
                            <SortableScreenshot
                              key={screenshot.id}
                              screenshot={screenshot}
                              isSelected={selectedIds.has(screenshot.id)}
                              onToggleSelect={handleToggleSelect}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {type.width} x {type.height}px &middot; Drag to reorder
                  </p>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
}
