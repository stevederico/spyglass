/**
 * Screenshot composer view for creating App Store marketing screenshots
 *
 * Provides a canvas-based editor that layers background, device frame,
 * screenshot, and marketing text. Left panel shows a live preview,
 * right panel provides controls for all settings.
 *
 * @component
 * @returns {JSX.Element} Screenshot composer interface
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Switch } from '@stevederico/skateboard-ui/shadcn/ui/switch';
import { Slider } from '@stevederico/skateboard-ui/shadcn/ui/slider';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { toast } from 'sonner';
import { DEVICES, FONT_WEIGHTS, drawComposite, exportCanvasPNG } from './composerHelpers.js';

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

export default function ComposerView() {
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

  const currentDevice = DEVICES[device];

  /**
   * Load an image file from a File object and return an HTMLImageElement
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
   * Handle background image upload from file input
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
   * Handle screenshot upload from file input or drop
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

  // Redraw canvas whenever any setting changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    drawComposite(canvas, {
      device,
      showBezel,
      screenshotImage,
      textLine1,
      textLine2,
      textPosition,
      fontSize,
      textColor,
      textShadow,
      fontWeight,
      bgColor,
      isGradient,
      gradientStart,
      gradientEnd,
      gradientDirection,
      bgImage
    });
  }, [
    device, showBezel, screenshotImage,
    textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
    bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage
  ]);

  return (
    <>
      <Header title="Composer" />
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
          <aside className="flex flex-col gap-4 lg:w-2/5" aria-label="Composer settings">

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
    </>
  );
}
