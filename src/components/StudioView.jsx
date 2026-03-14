/**
 * Studio view for creating App Store marketing screenshots with localization
 *
 * Provides a canvas-based editor that layers background, device frame,
 * screenshot, and marketing text. Left panel shows a live preview,
 * right panel provides controls for all settings including batch
 * translation into all 28 App Store Connect locales.
 *
 * @component
 * @returns {JSX.Element} Screenshot studio interface
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Switch } from '@stevederico/skateboard-ui/shadcn/ui/switch';
import { Slider } from '@stevederico/skateboard-ui/shadcn/ui/slider';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Progress } from '@stevederico/skateboard-ui/shadcn/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@stevederico/skateboard-ui/shadcn/ui/table';
import { ScrollArea } from '@stevederico/skateboard-ui/shadcn/ui/scroll-area';
import { toast } from 'sonner';
import { DEVICES, FONT_WEIGHTS, drawComposite, exportCanvasPNG } from './composerHelpers.js';
import { useApp } from './AppContext.jsx';
import AppPicker from './AppPicker.jsx';

/** Device key options for the device select dropdown */
const DEVICE_OPTIONS = Object.entries(DEVICES).map(([key, val]) => ({
  key,
  label: val.label
}));

/** Gradient direction options */
const GRADIENT_DIRECTIONS = [
  { value: 'top-bottom', label: 'Top to Bottom' },
  { value: 'left-right', label: 'Left to Right' },
  { value: 'diagonal', label: 'Diagonal' }
];

/** Font weight options */
const WEIGHT_OPTIONS = Object.keys(FONT_WEIGHTS);

/** All supported App Store Connect locales */
const LOCALES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'en-AU', name: 'English (Australia)' },
  { code: 'en-CA', name: 'English (Canada)' },
  { code: 'da-DK', name: 'Danish' },
  { code: 'de-DE', name: 'German' },
  { code: 'el-GR', name: 'Greek' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'es-MX', name: 'Spanish (Mexico)' },
  { code: 'fi-FI', name: 'Finnish' },
  { code: 'fr-FR', name: 'French (France)' },
  { code: 'fr-CA', name: 'French (Canada)' },
  { code: 'id-ID', name: 'Indonesian' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'ms-MY', name: 'Malay' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'no-NO', name: 'Norwegian' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'sv-SE', name: 'Swedish' },
  { code: 'th-TH', name: 'Thai' },
  { code: 'tr-TR', name: 'Turkish' },
  { code: 'cmn-Hans', name: 'Chinese (Simplified)' },
  { code: 'cmn-Hant', name: 'Chinese (Traditional)' },
  { code: 'vi-VI', name: 'Vietnamese' }
];

/** Locale codes that use English source text directly */
const ENGLISH_LOCALES = new Set(['en-US', 'en-GB', 'en-AU', 'en-CA']);

/**
 * Return Badge variant and label for a translation status
 *
 * @param {string} status - One of 'original', 'translated', 'modified', 'error'
 * @returns {{ label: string, variant: string }} Badge display properties
 */
function getStatusBadge(status) {
  switch (status) {
    case 'original':
      return { label: 'Original', variant: 'secondary' };
    case 'translated':
      return { label: 'Translated', variant: 'default' };
    case 'modified':
      return { label: 'Modified', variant: 'outline' };
    case 'error':
      return { label: 'Error', variant: 'destructive' };
    default:
      return { label: 'Pending', variant: 'secondary' };
  }
}

export default function StudioView() {
  const { selectedApp } = useApp();
  const canvasRef = useRef(null);

  // Background state
  const [bgColor, setBgColor] = useState('#1a1a2e');
  const [isGradient, setIsGradient] = useState(false);
  const [gradientStart, setGradientStart] = useState('#1a1a2e');
  const [gradientEnd, setGradientEnd] = useState('#16213e');
  const [gradientDirection, setGradientDirection] = useState('top-bottom');
  const [bgImage, setBgImage] = useState(null);

  // Text state
  const [textLine1, setTextLine1] = useState('Track Your Fitness');
  const [textLine2, setTextLine2] = useState('Reach Your Goals');
  const [textPosition, setTextPosition] = useState('top');
  const [fontSize, setFontSize] = useState(42);
  const [textColor, setTextColor] = useState('#ffffff');
  const [textShadow, setTextShadow] = useState(true);
  const [fontWeight, setFontWeight] = useState('Bold');

  // Device state
  const [device, setDevice] = useState('iphone-67');
  const [showBezel, setShowBezel] = useState(true);
  const [screenshotImage, setScreenshotImage] = useState(null);

  // Localization state
  const [translations, setTranslations] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [showTranslations, setShowTranslations] = useState(false);

  const currentDevice = DEVICES[device];
  const hasTranslations = Object.keys(translations).length > 0;

  /**
   * Load an image file from a File object
   *
   * @param {File} file - Image file to load
   * @returns {Promise<HTMLImageElement>} Loaded image element
   */
  const loadImage = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  /**
   * Handle background image upload
   *
   * @param {Event} e - File input change event
   */
  async function handleBgUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const img = await loadImage(file);
      setBgImage(img);
    } catch {
      toast.error('Failed to load background image');
    }
  }

  /**
   * Handle screenshot upload
   *
   * @param {Event} e - File input change event
   */
  async function handleScreenshotUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const img = await loadImage(file);
      setScreenshotImage(img);
      toast.success('Screenshot loaded');
    } catch {
      toast.error('Failed to load screenshot');
    }
  }

  /**
   * Handle file drop on the screenshot upload area
   *
   * @param {DragEvent} e - Drop event
   */
  async function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const img = await loadImage(file);
      setScreenshotImage(img);
      toast.success('Screenshot loaded');
    } catch {
      toast.error('Failed to load screenshot');
    }
  }

  /** Export the canvas as a PNG download */
  function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    exportCanvasPNG(canvas, device);
    toast.success('Screenshot exported');
  }

  /**
   * Translate current text lines into all App Store locales
   *
   * Sets English locales to source text, then calls the batch
   * translation API for all other locales with progress tracking.
   */
  const handleTranslateAll = useCallback(async () => {
    if (!textLine1.trim() && !textLine2.trim()) {
      toast.error('Enter marketing text first');
      return;
    }

    setIsTranslating(true);
    setTranslationProgress(0);
    setShowTranslations(true);

    const newTranslations = {};

    for (const code of ENGLISH_LOCALES) {
      newTranslations[code] = {
        line1: textLine1,
        line2: textLine2,
        status: 'original'
      };
    }

    const nonEnglishLocales = LOCALES.filter((l) => !ENGLISH_LOCALES.has(l.code));
    let completed = 0;

    setTranslationProgress(Math.round((ENGLISH_LOCALES.size / LOCALES.length) * 100));
    setTranslations({ ...newTranslations });

    for (const locale of nonEnglishLocales) {
      try {
        const response = await apiRequest('/translate/batch', {
          method: 'POST',
          body: JSON.stringify({
            texts: [textLine1, textLine2],
            source: 'en',
            target: locale.code
          })
        });

        if (response?.translations) {
          newTranslations[locale.code] = {
            line1: response.translations[0] ?? '',
            line2: response.translations[1] ?? '',
            status: 'translated'
          };
        } else {
          newTranslations[locale.code] = { line1: '', line2: '', status: 'error' };
        }
      } catch {
        newTranslations[locale.code] = { line1: '', line2: '', status: 'error' };
      }

      completed++;
      setTranslationProgress(Math.round(((ENGLISH_LOCALES.size + completed) / LOCALES.length) * 100));
      setTranslations({ ...newTranslations });
    }

    setIsTranslating(false);
    setTranslationProgress(100);
    toast.success('Translation complete');
  }, [textLine1, textLine2]);

  /**
   * Handle manual edit of a translated cell
   *
   * @param {string} localeCode - Locale code being edited
   * @param {'line1'|'line2'} field - Which line is being edited
   * @param {string} value - New translation text
   */
  const handleCellEdit = useCallback((localeCode, field, value) => {
    setTranslations((prev) => ({
      ...prev,
      [localeCode]: {
        ...prev[localeCode],
        [field]: value,
        status: ENGLISH_LOCALES.has(localeCode) ? 'original' : 'modified'
      }
    }));
  }, []);

  /** Copy all translations as JSON to clipboard */
  const handleCopyAll = useCallback(async () => {
    if (!hasTranslations) {
      toast.error('No translations to copy');
      return;
    }

    const output = {};
    for (const locale of LOCALES) {
      const t = translations[locale.code];
      if (t) {
        output[locale.code] = { name: locale.name, line1: t.line1, line2: t.line2 };
      }
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
      toast.success('Translations copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [translations, hasTranslations]);

  // Redraw canvas whenever any setting changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    drawComposite(canvas, {
      device, showBezel, screenshotImage,
      textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
      bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage
    });
  }, [
    device, showBezel, screenshotImage,
    textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
    bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage
  ]);

  return (
    <>
      <Header title="" className="[&>div>div:last-child]:ml-0">
        <AppPicker />
      </Header>
      {!selectedApp ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Select an app to get started</p>
        </div>
      ) : (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4 md:p-6 lg:flex-row">

          {/* Left: Canvas Preview */}
          <section className="flex flex-col items-center gap-3 lg:w-3/5" aria-label="Screenshot preview">
            <div className="w-full max-w-md rounded-lg border border-border bg-accent/30 p-4">
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: 'auto', borderRadius: '8px' }}
                aria-label="Composed screenshot preview"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {currentDevice.width} &times; {currentDevice.height}px &mdash; {currentDevice.label}
            </p>
          </section>

          {/* Right: Controls */}
          <aside className="flex flex-col gap-4 lg:w-2/5" aria-label="Studio settings">

            {/* Background Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Background</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Label htmlFor="bg-color">Color</Label>
                  <input
                    type="color"
                    id="bg-color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-border"
                    aria-label="Background color"
                  />
                  <span className="text-xs text-muted-foreground">{bgColor}</span>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="gradient-toggle">Gradient</Label>
                  <Switch
                    id="gradient-toggle"
                    checked={isGradient}
                    onCheckedChange={setIsGradient}
                    aria-label="Toggle gradient background"
                  />
                </div>

                {isGradient && (
                  <div className="flex flex-col gap-3 pl-2">
                    <div className="flex items-center gap-3">
                      <Label htmlFor="grad-start">Start</Label>
                      <input
                        type="color"
                        id="grad-start"
                        value={gradientStart}
                        onChange={(e) => setGradientStart(e.target.value)}
                        className="h-8 w-12 cursor-pointer rounded border border-border"
                        aria-label="Gradient start color"
                      />
                      <span className="text-xs text-muted-foreground">{gradientStart}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label htmlFor="grad-end">End</Label>
                      <input
                        type="color"
                        id="grad-end"
                        value={gradientEnd}
                        onChange={(e) => setGradientEnd(e.target.value)}
                        className="h-8 w-12 cursor-pointer rounded border border-border"
                        aria-label="Gradient end color"
                      />
                      <span className="text-xs text-muted-foreground">{gradientEnd}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="grad-direction">Direction</Label>
                      <Select value={gradientDirection} onValueChange={setGradientDirection}>
                        <SelectTrigger id="grad-direction" aria-label="Gradient direction">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRADIENT_DIRECTIONS.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bg-upload">Background Image</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('bg-upload').click()}
                      aria-label="Upload background image"
                    >
                      Upload Background
                    </Button>
                    {bgImage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setBgImage(null)}
                        aria-label="Remove background image"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    type="file"
                    id="bg-upload"
                    accept="image/*"
                    onChange={handleBgUpload}
                    className="hidden"
                    aria-label="Background image file input"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Text Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Text</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="text-line1">Line 1</Label>
                  <Input
                    id="text-line1"
                    value={textLine1}
                    onChange={(e) => setTextLine1(e.target.value)}
                    placeholder="Track Your Fitness"
                    aria-label="Marketing text line 1"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="text-line2">Line 2</Label>
                  <Input
                    id="text-line2"
                    value={textLine2}
                    onChange={(e) => setTextLine2(e.target.value)}
                    placeholder="Reach Your Goals"
                    aria-label="Marketing text line 2"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="text-position">Position</Label>
                  <Select value={textPosition} onValueChange={setTextPosition}>
                    <SelectTrigger id="text-position" aria-label="Text position">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Top</SelectItem>
                      <SelectItem value="bottom">Bottom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="font-size">Font Size: {fontSize}px</Label>
                  <Slider
                    id="font-size"
                    min={24}
                    max={72}
                    step={1}
                    value={[fontSize]}
                    onValueChange={(val) => setFontSize(val[0])}
                    aria-label="Font size slider"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Label htmlFor="text-color">Color</Label>
                  <input
                    type="color"
                    id="text-color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-border"
                    aria-label="Text color"
                  />
                  <span className="text-xs text-muted-foreground">{textColor}</span>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="text-shadow-toggle">Text Shadow</Label>
                  <Switch
                    id="text-shadow-toggle"
                    checked={textShadow}
                    onCheckedChange={setTextShadow}
                    aria-label="Toggle text shadow"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="font-weight">Font Weight</Label>
                  <Select value={fontWeight} onValueChange={setFontWeight}>
                    <SelectTrigger id="font-weight" aria-label="Font weight">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_OPTIONS.map((w) => (
                        <SelectItem key={w} value={w}>{w}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Device Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Device</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="device-select">Device Type</Label>
                  <Select value={device} onValueChange={setDevice}>
                    <SelectTrigger id="device-select" aria-label="Device type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVICE_OPTIONS.map((d) => (
                        <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="bezel-toggle">Show Device Frame</Label>
                  <Switch
                    id="bezel-toggle"
                    checked={showBezel}
                    onCheckedChange={setShowBezel}
                    aria-label="Toggle device frame bezel"
                  />
                </div>

                <Separator />

                <div className="flex flex-col gap-1.5">
                  <Label>Screenshot</Label>
                  <div
                    className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-accent/20 p-4 transition-colors hover:bg-accent/40"
                    onClick={() => document.getElementById('screenshot-upload').click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    role="button"
                    tabIndex={0}
                    aria-label="Upload screenshot — click or drag and drop"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        document.getElementById('screenshot-upload').click();
                      }
                    }}
                  >
                    {screenshotImage ? (
                      <p className="text-sm text-foreground">Screenshot loaded — click to replace</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-muted-foreground">Drop screenshot here</p>
                        <p className="text-xs text-muted-foreground">or click to browse</p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    id="screenshot-upload"
                    accept="image/*"
                    onChange={handleScreenshotUpload}
                    className="hidden"
                    aria-label="Screenshot file input"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Localization Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Localization</CardTitle>
                <CardDescription>
                  Translate marketing text into all 28 App Store locales
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleTranslateAll}
                    disabled={isTranslating || (!textLine1.trim() && !textLine2.trim())}
                    aria-label="Translate text into all locales"
                  >
                    {isTranslating ? 'Translating...' : 'Translate All'}
                  </Button>
                  {hasTranslations && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTranslations(!showTranslations)}
                        aria-label={showTranslations ? 'Hide translations table' : 'Show translations table'}
                      >
                        {showTranslations ? 'Hide' : 'Show'} ({Object.keys(translations).length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyAll}
                        disabled={isTranslating}
                        aria-label="Copy all translations as JSON"
                      >
                        Copy
                      </Button>
                    </>
                  )}
                </div>

                {isTranslating && (
                  <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
                    <Progress value={translationProgress} aria-label="Translation progress" />
                    <p className="text-xs text-muted-foreground">
                      Translating... {translationProgress}%
                    </p>
                  </div>
                )}

                {showTranslations && hasTranslations && (
                  <ScrollArea className="h-[400px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[140px]">Language</TableHead>
                          <TableHead>Line 1</TableHead>
                          <TableHead>Line 2</TableHead>
                          <TableHead className="w-[90px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {LOCALES.map((locale) => {
                          const t = translations[locale.code];
                          if (!t) return null;
                          const { label, variant } = getStatusBadge(t.status);

                          return (
                            <TableRow key={locale.code}>
                              <TableCell className="text-xs font-medium">
                                {locale.name}
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={t.line1}
                                  onChange={(e) => handleCellEdit(locale.code, 'line1', e.target.value)}
                                  disabled={isTranslating}
                                  aria-label={`${locale.name} line 1 translation`}
                                  className="h-7 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={t.line2}
                                  onChange={(e) => handleCellEdit(locale.code, 'line2', e.target.value)}
                                  disabled={isTranslating}
                                  aria-label={`${locale.name} line 2 translation`}
                                  className="h-7 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Badge variant={variant} className="text-xs">{label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Export Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Export</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button onClick={handleExport} aria-label="Export composed screenshot as PNG">
                  Export PNG
                </Button>
                <p className="text-xs text-muted-foreground">
                  Output: {currentDevice.width} &times; {currentDevice.height}px
                </p>
              </CardContent>
            </Card>

          </aside>
        </div>
      </div>
      )}
    </>
  );
}
