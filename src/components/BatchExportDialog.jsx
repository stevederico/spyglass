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
 * @returns {JSX.Element} Batch export sheet
 */
import { useState, useCallback } from 'react';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@stevederico/skateboard-ui/shadcn/ui/sheet';
import { Checkbox } from '@stevederico/skateboard-ui/shadcn/ui/checkbox';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Progress } from '@stevederico/skateboard-ui/shadcn/ui/progress';
import { ScrollArea } from '@stevederico/skateboard-ui/shadcn/ui/scroll-area';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { toast } from 'sonner';
import { DEVICES, drawComposite } from './composerHelpers.js';

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
    const canvas = document.createElement('canvas');
    drawComposite(canvas, state);
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(new Uint8Array(0));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, 'image/png');
  });
}

export default function BatchExportDialog({ open, onOpenChange, baseState, translations, appName, appId }) {
  const [selectedDevices, setSelectedDevices] = useState(
    new Set(DEVICE_ENTRIES.map((d) => d.key))
  );
  const [selectedLocales, setSelectedLocales] = useState(
    new Set(Object.keys(translations || {}))
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
    if (selectedDevices.size === DEVICE_ENTRIES.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(DEVICE_ENTRIES.map((d) => d.key)));
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

  const totalCombinations = selectedDevices.size * selectedLocales.size;

  /**
   * Generate all screenshot combinations and post as an export package
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
    const total = selectedDevices.size * selectedLocales.size;
    const localeArray = [...selectedLocales];
    const deviceArray = [...selectedDevices];
    let position = 1;

    for (const locale of localeArray) {
      const t = translations[locale];
      if (!t) continue;

      for (const deviceKey of deviceArray) {
        setProgressLabel(`${locale} / ${DEVICES[deviceKey].label}`);

        const state = {
          ...baseState,
          device: deviceKey,
          textLine1: t.line1 || baseState.textLine1,
          textLine2: t.line2 || baseState.textLine2
        };

        const bytes = await renderToBytes(state);
        const filename = ascFilename(locale, position, deviceKey);
        files[filename] = bytes;

        completed++;
        setProgress(Math.round((completed / total) * 100));
      }
      position++;
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

      await fetch('/api/exports', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      toast.success(`Export package created with ${completed} screenshots`);
      onOpenChange(false);
    } catch (err) {
      console.error('Export package creation failed:', err);
      toast.error('Failed to create export package');
    }

    setIsGenerating(false);
    setProgress(100);
    setProgressLabel('Complete');
  }, [selectedDevices, selectedLocales, baseState, translations, appName, appId, onOpenChange]);

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
          {/* Devices */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Devices</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={toggleAllDevices}
                aria-label={selectedDevices.size === DEVICE_ENTRIES.length ? 'Deselect all devices' : 'Select all devices'}
              >
                {selectedDevices.size === DEVICE_ENTRIES.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <ScrollArea className="h-48 rounded-md border p-2">
              <div className="flex flex-col gap-1.5">
                {DEVICE_ENTRIES.map((d) => (
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
