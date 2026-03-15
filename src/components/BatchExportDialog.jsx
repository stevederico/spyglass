/**
 * Batch export dialog for generating screenshots across multiple devices and locales
 *
 * Renders all combinations of selected devices and translated locales,
 * packages them and posts to the backend as an export package.
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.open - Whether the sheet is open
 * @param {Function} props.onOpenChange - Callback to toggle sheet visibility
 * @param {Object} props.baseState - Current screenshot composer state
 * @param {Object} props.translations - Map of locale code to { line1, line2, status }
 * @param {string} props.appName - App name for the export package
 * @param {string} props.appId - App identifier for the export package
 * @param {Object[]} [props.slots] - Optional array of slot states for multi-screenshot export
 * @returns {JSX.Element} Batch export sheet
 */
import { useState, useCallback } from 'react';
import { getBackendURL } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@stevederico/skateboard-ui/shadcn/ui/sheet';
import { Checkbox } from '@stevederico/skateboard-ui/shadcn/ui/checkbox';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Progress } from '@stevederico/skateboard-ui/shadcn/ui/progress';
import { ScrollArea } from '@stevederico/skateboard-ui/shadcn/ui/scroll-area';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { toast } from 'sonner';
import { DEVICES, drawComposite, getDeviceFamily, detectFamilyFromImage } from './composerHelpers.js';

/** All available device keys with labels */
const DEVICE_ENTRIES = Object.entries(DEVICES).map(([key, dev]) => ({
  key,
  label: dev.label,
  width: dev.width,
  height: dev.height
}));

/**
 * Generate ASC-compatible filename for a screenshot
 *
 * @param {string} locale - Locale code (e.g. "en-US")
 * @param {number} position - Screenshot position (1-based)
 * @param {string} deviceKey - Device key from DEVICES
 * @returns {string} Formatted filename
 */
function ascFilename(locale, position, deviceKey) {
  return `${locale}/screenshot-${position}-${deviceKey}.png`;
}

/**
 * Render a single composite as a Uint8Array PNG
 *
 * @param {Object} state - Full composer state with device override
 * @returns {Promise<Uint8Array>} PNG data as byte array
 */
function renderToBytes(state) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(new Uint8Array(0)), 10000);
    try {
      const canvas = document.createElement('canvas');
      drawComposite(canvas, state);
      canvas.toBlob((blob) => {
        clearTimeout(timeout);
        if (!blob) {
          resolve(new Uint8Array(0));
          return;
        }
        blob.arrayBuffer()
          .then((buf) => resolve(new Uint8Array(buf)))
          .catch(() => resolve(new Uint8Array(0)));
      }, 'image/png');
    } catch (err) {
      clearTimeout(timeout);
      console.error('renderToBytes failed:', err);
      resolve(new Uint8Array(0));
    }
  });
}

export default function BatchExportDialog({ open, onOpenChange, baseState, translations, appName, appId, slots }) {
  /** Filter devices to match screenshot family — ASC rejects mismatched screenshots */
  const screenshotFamily = baseState.screenshotImage
    ? detectFamilyFromImage(baseState.screenshotImage)
    : 'iphone';
  const allowedDevices = DEVICE_ENTRIES.filter((d) => getDeviceFamily(d.key) === screenshotFamily);
  /** Default to only the required device: iPhone 6.9" or iPad 13" */
  const requiredDevice = screenshotFamily === 'ipad' ? 'ipad-13' : 'iphone-69';

  const [selectedDevices, setSelectedDevices] = useState(
    new Set([requiredDevice])
  );
  const [selectedLocales, setSelectedLocales] = useState(
    new Set(Object.keys(translations || {}))
  );
  const [selectedSlots, setSelectedSlots] = useState(
    () => new Set(slots ? slots.map((_, i) => i) : [0])
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  /** Toggle a device in the selection set */
  function toggleDevice(key) {
    setSelectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Toggle a locale in the selection set */
  function toggleLocale(code) {
    setSelectedLocales((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  /** Select or deselect all devices */
  function toggleAllDevices() {
    if (selectedDevices.size === allowedDevices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(allowedDevices.map((d) => d.key)));
    }
  }

  /** Select or deselect all locales */
  function toggleAllLocales() {
    const allLocales = Object.keys(translations || {});
    if (selectedLocales.size === allLocales.length) {
      setSelectedLocales(new Set());
    } else {
      setSelectedLocales(new Set(allLocales));
    }
  }

  /** Toggle a slot in the selection set */
  function toggleSlot(index) {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  /** Select or deselect all slots */
  function toggleAllSlots() {
    if (!slots) return;
    if (selectedSlots.size === slots.length) {
      setSelectedSlots(new Set());
    } else {
      setSelectedSlots(new Set(slots.map((_, i) => i)));
    }
  }

  const slotCount = slots && slots.length > 1 ? selectedSlots.size : 1;
  const totalCombinations = selectedDevices.size * selectedLocales.size * slotCount;

  /**
   * Generate all screenshot combinations and post as an export package.
   * When slots are provided, generates device x locale x slot-position matrix.
   */
  const handleGenerate = useCallback(async () => {
    if (selectedDevices.size === 0 || selectedLocales.size === 0) {
      toast.error('Select at least one device and one locale');
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setProgressLabel('Starting...');

    const files = {};
    let completed = 0;
    const total = selectedDevices.size * selectedLocales.size * slotCount;
    const localeArray = [...selectedLocales];
    const deviceArray = [...selectedDevices];
    const slotSources = slots && slots.length > 1
      ? slots.filter((_, i) => selectedSlots.has(i))
      : [baseState];

    for (const locale of localeArray) {
      const t = translations[locale];
      if (!t) continue;

      for (let si = 0; si < slotSources.length; si++) {
        const slotState = slotSources[si];
        const position = si + 1;
        const frameModelInfo = slotState.frameModel
          ? (slotState.frameModelInfo || null)
          : (baseState.frameModelInfo || null);

        for (const deviceKey of deviceArray) {
          setProgressLabel(`${locale} / ${DEVICES[deviceKey].label} / #${position}`);

          const useFrame = frameModelInfo && frameModelInfo.ascTier === deviceKey;
          const state = {
            ...slotState,
            fontFamily: slotState.selectedFont || slotState.fontFamily || '',
            device: deviceKey,
            textLine1: t.line1 || slotState.textLine1,
            textLine2: t.line2 || slotState.textLine2,
            frameImage: useFrame ? slotState.frameImage : null,
            frameModelInfo: useFrame ? frameModelInfo : null
          };

          const bytes = await renderToBytes(state);
          const filename = ascFilename(locale, position, deviceKey);
          files[filename] = bytes;

          completed++;
          setProgress(Math.round((completed / total) * 100));
        }
      }
    }

    // Post export package to backend
    try {
      const formData = new FormData();
      formData.append('appId', appId || '');
      formData.append('appName', appName || 'Untitled');
      formData.append('locales', JSON.stringify([...selectedLocales]));
      formData.append('devices', JSON.stringify([...selectedDevices]));
      formData.append('screenshotCount', String(completed));

      // Append each screenshot as a file
      for (const [filename, bytes] of Object.entries(files)) {
        // filename is like "en-US/screenshot-1-iphone-67.png"
        const parts = filename.split('/');
        const locale = parts[0];
        const fileBase = parts[parts.length - 1];
        const deviceMatch = fileBase.match(/screenshot-\d+-(.+)\.png/);
        const device = deviceMatch ? deviceMatch[1] : 'unknown';

        const blob = new Blob([bytes], { type: 'image/png' });
        formData.append(`file-${locale}-${device}`, blob, fileBase);
      }

      const response = await fetch(`${getBackendURL()}/exports`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      toast.success(`Export package created with ${completed} screenshots`);
      onOpenChange(false);
    } catch (err) {
      console.error('Export package creation failed:', err);
      toast.error('Failed to create export package');
    }

    setIsGenerating(false);
    setProgress(100);
    setProgressLabel('Complete');
  }, [selectedDevices, selectedLocales, selectedSlots, baseState, translations, appName, appId, onOpenChange, slots, slotCount]);

  const translatedLocales = Object.entries(translations || {}).filter(
    ([, t]) => t.status !== 'error'
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Batch Export</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4">
          {/* Screenshots */}
          {slots && slots.length > 1 && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Screenshots</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={toggleAllSlots}
                    aria-label={selectedSlots.size === slots.length ? 'Deselect all screenshots' : 'Select all screenshots'}
                  >
                    {selectedSlots.size === slots.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="flex gap-2 overflow-x-auto rounded-md border p-2">
                  {slots.map((slot, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleSlot(i)}
                      className={`flex shrink-0 flex-col items-center gap-1 rounded-md p-1 transition-colors ${selectedSlots.has(i) ? 'bg-accent ring-1 ring-primary' : 'opacity-40'}`}
                      aria-label={`${selectedSlots.has(i) ? 'Deselect' : 'Select'} screenshot ${i + 1}`}
                    >
                      <canvas
                        ref={(el) => {
                          if (!el) return;
                          drawComposite(el, {
                            ...slot,
                            fontFamily: slot.selectedFont || slot.fontFamily || '',
                            frameModelInfo: slot.frameModel ? null : null,
                          });
                        }}
                        className="rounded border border-border/50"
                        style={{ width: '64px', height: 'auto' }}
                        aria-hidden="true"
                      />
                      <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{selectedSlots.size} of {slots.length} selected</p>
              </div>
              <Separator />
            </>
          )}

          {/* Devices */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Devices</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={toggleAllDevices}
                aria-label={selectedDevices.size === allowedDevices.length ? 'Deselect all devices' : 'Select all devices'}
              >
                {selectedDevices.size === allowedDevices.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <ScrollArea className="h-48 rounded-md border p-2">
              <div className="flex flex-col gap-1.5">
                {allowedDevices.map((d) => (
                  <div key={d.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`dev-${d.key}`}
                      checked={selectedDevices.has(d.key)}
                      onCheckedChange={() => toggleDevice(d.key)}
                      aria-label={`Include ${d.label}`}
                    />
                    <Label htmlFor={`dev-${d.key}`} className="cursor-pointer text-xs">
                      {d.label}
                      <span className="ml-1 text-muted-foreground">({d.width}x{d.height})</span>
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">{selectedDevices.size} selected</p>
          </div>

          <Separator />

          {/* Locales */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Locales</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={toggleAllLocales}
                aria-label={selectedLocales.size === translatedLocales.length ? 'Deselect all locales' : 'Select all locales'}
              >
                {selectedLocales.size === translatedLocales.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            {translatedLocales.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Translate your marketing text first in the Localization section
              </p>
            ) : (
              <ScrollArea className="h-48 rounded-md border p-2">
                <div className="flex flex-col gap-1.5">
                  {translatedLocales.map(([code, t]) => (
                    <div key={code} className="flex items-center gap-2">
                      <Checkbox
                        id={`loc-${code}`}
                        checked={selectedLocales.has(code)}
                        onCheckedChange={() => toggleLocale(code)}
                        aria-label={`Include ${code}`}
                      />
                      <Label htmlFor={`loc-${code}`} className="cursor-pointer text-xs">
                        {code}
                      </Label>
                      <Badge
                        variant={t.status === 'original' ? 'secondary' : t.status === 'translated' ? 'default' : 'outline'}
                        className="text-[10px]"
                      >
                        {t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            <p className="text-xs text-muted-foreground">{selectedLocales.size} selected</p>
          </div>

          <Separator />

          {/* Summary & Generate */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total screenshots:</span>
              <Badge variant="secondary">{totalCombinations}</Badge>
            </div>

            {isGenerating && (
              <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
                <Progress value={progress} aria-label="Batch export progress" />
                <p className="text-xs text-muted-foreground">{progressLabel} — {progress}%</p>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || totalCombinations === 0}
              className="w-full"
              aria-label={`Generate ${totalCombinations} screenshots and download as zip`}
            >
              {isGenerating ? 'Generating...' : `Generate All (${totalCombinations})`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
