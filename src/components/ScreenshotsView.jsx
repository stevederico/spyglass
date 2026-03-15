/**
 * Screenshots view for creating App Store marketing screenshots with localization
 *
 * Provides a canvas-based editor that layers background, device frame,
 * screenshot, and marketing text. Left panel shows a live preview,
 * right panel provides controls for all settings including batch
 * translation into all 28 App Store Connect locales. Supports undo/redo,
 * template management, custom fonts, batch export, and preview-all-sizes.
 *
 * @component
 * @returns {JSX.Element} Screenshot composer interface
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSessionState } from './useSessionState.js';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Switch } from '@stevederico/skateboard-ui/shadcn/ui/switch';

import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Progress } from '@stevederico/skateboard-ui/shadcn/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@stevederico/skateboard-ui/shadcn/ui/table';
import { ScrollArea } from '@stevederico/skateboard-ui/shadcn/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { DEVICES, FONT_WEIGHTS, drawComposite, exportCanvasPNG, renderForLocale } from './composerHelpers.js';
import { FRAME_MODELS } from './frameManifest.js';
import { loadFrame, preloadFrame } from './frameLoader.js';
import { useApp } from './AppContext.jsx';
import AppPicker from './AppPicker.jsx';
import TemplatePanel from './TemplatePanel.jsx';
import BatchExportDialog from './BatchExportDialog.jsx';
import { useHistory } from './useHistory.js';

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

/** Curated Google Fonts for marketing text */
const GOOGLE_FONTS = [
  'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Poppins',
  'Oswald', 'Raleway', 'Playfair Display', 'Merriweather', 'Nunito',
  'Inter', 'Work Sans', 'DM Sans', 'Outfit', 'Space Grotesk',
  'Bebas Neue', 'Archivo Black', 'Righteous', 'Pacifico', 'Caveat'
];

/** Set of Google Fonts already loaded via CSS link */
const loadedGoogleFonts = new Set();

/**
 * Load a Google Font by injecting a stylesheet link element
 *
 * @param {string} fontName - Google Font family name
 */
function loadGoogleFont(fontName) {
  if (!fontName || loadedGoogleFonts.has(fontName)) return;
  loadedGoogleFonts.add(fontName);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;700&display=swap`;
  document.head.appendChild(link);
}

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

/** Debounce delay for pushing state to undo history (ms) */
const HISTORY_DEBOUNCE_MS = 500;

/**
 * Return Badge variant and label for a translation status
 *
 * @param {string} status - One of 'original', 'translated', 'modified', 'error'
 * @returns {{ label: string, variant: string }} Badge display properties
 */
/**
 * Return Badge variant and label for a translation status
 *
 * @param {string} status - One of 'waiting', 'translating', 'original', 'translated', 'modified', 'error'
 * @returns {{ label: string, variant: string }} Badge display properties
 */
function getStatusBadge(status) {
  switch (status) {
    case 'original':
      return { label: 'Original', variant: 'secondary' };
    case 'translated':
      return { label: 'Translated', variant: 'default' };
    case 'translating':
      return { label: 'Translating', variant: 'outline' };
    case 'modified':
      return { label: 'Modified', variant: 'outline' };
    case 'error':
      return { label: 'Error', variant: 'destructive' };
    default:
      return { label: 'Waiting', variant: 'secondary' };
  }
}

export default function ScreenshotsView() {
  const { selectedApp } = useApp();
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const [editingLine, setEditingLine] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Background state
  const [bgTab, setBgTab] = useSessionState('bgTab', 'fill');
  const [bgColor, setBgColor] = useSessionState('bgColor', '#1a1a2e');
  const [isGradient, setIsGradient] = useSessionState('isGradient', false);
  const [gradientStart, setGradientStart] = useSessionState('gradientStart', '#1a1a2e');
  const [gradientEnd, setGradientEnd] = useSessionState('gradientEnd', '#16213e');
  const [gradientDirection, setGradientDirection] = useSessionState('gradientDirection', 'top-bottom');
  const [bgImage, setBgImage] = useSessionState('bgImage', null, { image: true });
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);

  // Text state (persisted)
  const [textLine1, setTextLine1] = useSessionState('textLine1', 'Track Your Fitness');
  const [textLine2, setTextLine2] = useSessionState('textLine2', 'Reach Your Goals');
  const [textPosition, setTextPosition] = useSessionState('textPosition', 'top');
  const [fontSize, setFontSize] = useSessionState('fontSize', 100);
  const [textColor, setTextColor] = useSessionState('textColor', '#ffffff');
  const [textShadow, setTextShadow] = useSessionState('textShadow', 8);
  const [fontWeight, setFontWeight] = useSessionState('fontWeight', 'Bold');
  const [autoFitText, setAutoFitText] = useSessionState('autoFitText', true);

  // Font state (persisted)
  const [selectedFont, setSelectedFont] = useSessionState('selectedFont', '');

  // Device state (persisted)
  const [device, setDevice] = useSessionState('device', 'iphone-69');
  const [showBezel, setShowBezel] = useSessionState('showBezel', true);
  const [screenshotImage, setScreenshotImage] = useSessionState('screenshotImage', null, { image: true });

  // Device frame PNG state (persisted)
  const [frameModel, setFrameModel] = useSessionState('frameModel', 'iphone-17-pro-max');
  const [frameColor, setFrameColor] = useSessionState('frameColor', 'silver');
  const [frameImage, setFrameImage] = useSessionState('frameImage', null, { image: true });
  const [frameLayout, setFrameLayout] = useSessionState('frameLayout', 'full');
  const [orientation, setOrientation] = useSessionState('orientation', 'portrait');

  // Localization state (persisted)
  const [translations, setTranslations] = useSessionState('translations', {});
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [showTranslations, setShowTranslations] = useState(false);
  const [selectedLocales, setSelectedLocales] = useState(() => new Set(LOCALES.filter((l) => !ENGLISH_LOCALES.has(l.code)).map((l) => l.code)));
  const [previewLocale, setPreviewLocale] = useSessionState('previewLocale', 'en-US');

  // Layer visibility
  const [layers, setLayers] = useSessionState('layers', {
    background: true, device: true, headline: true, subheadline: false
  });

  /**
   * Toggle visibility of a named layer
   *
   * @param {string} name - Layer key to toggle
   */
  function toggleLayer(name) {
    setLayers((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  // QoL state
  const [showPreviewAll, setShowPreviewAll] = useState(false);
const [panelOpen, setPanelOpen] = useState(true);

  // Batch export state
  const [showBatchExport, setShowBatchExport] = useState(false);

  // Undo/redo history
  const isRestoringRef = useRef(false);
  const { currentState: historyState, pushState, undo, redo, canUndo, canRedo } = useHistory({
    bgColor: '#1a1a2e', isGradient: false, gradientStart: '#1a1a2e', gradientEnd: '#16213e',
    gradientDirection: 'top-bottom', textLine1: 'Track Your Fitness', textLine2: 'Reach Your Goals',
    textPosition: 'top', fontSize: 100, textColor: '#ffffff', textShadow: 8, fontWeight: 'Bold',
    autoFitText: true, device: 'iphone-69', showBezel: true, selectedFont: '',
    frameModel: 'iphone-17-pro-max', frameColor: 'silver', frameLayout: 'full',
    orientation: 'portrait'
  });

  const currentDevice = DEVICES[device];
  const hasTranslations = Object.keys(translations).length > 0;

  /** Max width for the canvas container — keeps landscape the same visual area as portrait, just rotated */
  const PORTRAIT_BASE_W = { open: 384, closed: 448 };
  const canvasMaxWidth = useMemo(() => {
    const { width, height } = currentDevice;
    const baseW = panelOpen ? PORTRAIT_BASE_W.open : PORTRAIT_BASE_W.closed;
    if (orientation === 'landscape') {
      return Math.round(baseW * (height / width));
    }
    return baseW;
  }, [currentDevice, orientation, panelOpen]);

  // Load Google Font when selectedFont changes
  useEffect(() => {
    if (selectedFont && GOOGLE_FONTS.includes(selectedFont)) {
      loadGoogleFont(selectedFont);
    }
  }, [selectedFont]);

  // Push current settings to history (debounced, skip during restore)
  useEffect(() => {
    if (isRestoringRef.current) return;
    const timer = setTimeout(() => {
      pushState({
        bgColor, isGradient, gradientStart, gradientEnd, gradientDirection,
        textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
        autoFitText, device, showBezel, selectedFont, frameModel, frameColor, frameLayout, orientation
      });
    }, HISTORY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    bgColor, isGradient, gradientStart, gradientEnd, gradientDirection,
    textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
    autoFitText, device, showBezel, selectedFont, frameModel, frameColor, frameLayout, orientation, pushState
  ]);

  // Restore state from history on undo/redo
  useEffect(() => {
    if (!historyState) return;
    isRestoringRef.current = true;
    setBgColor(historyState.bgColor);
    setIsGradient(historyState.isGradient);
    setGradientStart(historyState.gradientStart);
    setGradientEnd(historyState.gradientEnd);
    setGradientDirection(historyState.gradientDirection);
    setTextLine1(historyState.textLine1);
    setTextLine2(historyState.textLine2);
    setTextPosition(historyState.textPosition);
    setFontSize(historyState.fontSize);
    setTextColor(historyState.textColor);
    setTextShadow(historyState.textShadow);
    setFontWeight(historyState.fontWeight);
    setAutoFitText(historyState.autoFitText);
    setDevice(historyState.device);
    setShowBezel(historyState.showBezel);
    setSelectedFont(historyState.selectedFont || '');
    setFrameModel(historyState.frameModel || '');
    setFrameColor(historyState.frameColor || '');
    setFrameLayout(historyState.frameLayout || 'full');
    setOrientation(historyState.orientation || 'portrait');
    // Allow next tick before re-enabling history push
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [historyState]);

  // Keyboard shortcuts for undo/redo (Cmd+Z, Cmd+Shift+Z)
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

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
   * Generate a background image using xAI Grok image generation.
   * Calls POST /api/ai/generate-background with the user's prompt,
   * receives a base64 data URI, and loads it as the canvas background.
   */
  async function handleGenerateBg() {
    if (!aiPrompt.trim()) {
      toast.error('Enter a description for the background');
      return;
    }
    setIsGeneratingBg(true);
    try {
      const response = await apiRequest('/ai/generate-background', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt })
      });
      if (response?.image) {
        const img = new Image();
        img.onload = () => {
          setBgImage(img);
          toast.success('AI background applied');
        };
        img.onerror = () => toast.error('Failed to load generated image');
        img.src = response.image;
      } else {
        toast.error(response?.error || 'Failed to generate background');
      }
    } catch (err) {
      toast.error('Background generation failed');
    } finally {
      setIsGeneratingBg(false);
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

  /**
   * Handle click on canvas to enable inline text editing.
   * Maps click position from displayed CSS pixels to canvas coordinates,
   * determines if the click falls in the text area, and activates editing.
   *
   * @param {MouseEvent} e - Click event on the canvas element
   */
  function handleCanvasClick(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    const deviceInfo = DEVICES[device];
    const { width: cw, height: ch } = deviceInfo;
    const padding = ch * 0.12;
    const textAreaHeight = ch * 0.15;
    const isTop = textPosition === 'top';
    const scaledFontSize = fontSize * (cw / 1290);

    // Compute baseline Y for each line (matches drawComposite exactly)
    let baseY1;
    if (isTop) {
      baseY1 = padding * 0.6;
    } else {
      const frameY = padding * 0.5;
      const availableHeight = ch - textAreaHeight - padding;
      const screenScale = Math.min((cw * 0.85) / deviceInfo.width, availableHeight / deviceInfo.height);
      const frameH = deviceInfo.height * screenScale;
      baseY1 = frameY + frameH + padding * 0.5;
    }
    const baseY2 = baseY1 + scaledFontSize * 1.4;

    // Convert baseline to top-edge hit zones (ascender ~0.8, line height ~1.3)
    const line1Top = baseY1 - scaledFontSize * 0.8;
    const line1Bottom = baseY1 + scaledFontSize * 0.5;
    const line2Top = baseY2 - scaledFontSize * 0.75 * 0.8;
    const line2Bottom = baseY2 + scaledFontSize * 0.75 * 0.5;

    if (cy >= line1Top && cy <= line1Bottom) {
      setEditingLine(1);
      return;
    }
    if (cy >= line2Top && cy <= line2Bottom) {
      setEditingLine(2);
      return;
    }
    setEditingLine(null);
  }

  /**
   * Compute the CSS position and style for the inline text overlay input.
   * Maps canvas text coordinates to the displayed element coordinates.
   *
   * @param {1|2} lineNum - Which text line (1 or 2)
   * @returns {{ top: string, left: string, width: string, fontSize: string, textAlign: string }}
   */
  function getTextOverlayStyle(lineNum) {
    const canvas = canvasRef.current;
    if (!canvas) return {};

    const rect = canvas.getBoundingClientRect();
    const deviceInfo = DEVICES[device];
    const { width: cw, height: ch } = deviceInfo;
    const displayScale = rect.width / cw;
    const padding = ch * 0.12;
    const textAreaHeight = ch * 0.15;
    const isTop = textPosition === 'top';
    const scaledFontSize = fontSize * (cw / 1290);
    const lineFontSize = lineNum === 1 ? scaledFontSize : scaledFontSize * 0.75;

    // yCanvas = alphabetic baseline in canvas coords (matches fillText Y)
    let yCanvas;
    if (isTop) {
      yCanvas = lineNum === 1 ? padding * 0.6 : padding * 0.6 + scaledFontSize * 1.4;
    } else {
      const frameY = padding * 0.5;
      const availableHeight = ch - textAreaHeight - padding;
      const screenScale = Math.min((cw * 0.85) / deviceInfo.width, availableHeight / deviceInfo.height);
      const frameH = deviceInfo.height * screenScale;
      const textY1 = frameY + frameH + padding * 0.5;
      yCanvas = lineNum === 1 ? textY1 : textY1 + scaledFontSize * 1.4;
    }

    // Convert baseline Y to top-edge Y (ascender offset ~0.8 of font size)
    const topCanvas = yCanvas - lineFontSize * 0.8;
    const displayFontSize = Math.max(12, lineFontSize * displayScale);
    const fontFamilyValue = selectedFont || 'system-ui, -apple-system, sans-serif';

    return {
      position: 'absolute',
      top: `${topCanvas * displayScale}px`,
      left: '10%',
      width: '80%',
      height: `${lineFontSize * 1.3 * displayScale}px`,
      fontSize: `${displayFontSize}px`,
      fontWeight: FONT_WEIGHTS[fontWeight] || '700',
      fontFamily: fontFamilyValue,
      lineHeight: '1.2',
      color: textColor,
      textAlign: 'center',
      background: 'transparent',
      border: 'none',
      outline: '2px solid rgba(59, 130, 246, 0.5)',
      borderRadius: '4px',
      padding: '0 4px',
      margin: 0,
      boxSizing: 'border-box',
      caretColor: textColor,
    };
  }

  /** Export the canvas as a PNG download */
  function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    exportCanvasPNG(canvas, device);
    toast.success('Screenshot exported');
  }

  /**
   * Apply template settings to current screenshot state
   *
   * @param {Object} settings - Template settings object
   */
  const handleLoadTemplate = useCallback((settings) => {
    if (!settings) return;
    if (settings.bgColor !== undefined) setBgColor(settings.bgColor);
    if (settings.isGradient !== undefined) setIsGradient(settings.isGradient);
    if (settings.gradientStart !== undefined) setGradientStart(settings.gradientStart);
    if (settings.gradientEnd !== undefined) setGradientEnd(settings.gradientEnd);
    if (settings.gradientDirection !== undefined) setGradientDirection(settings.gradientDirection);
    if (settings.textColor !== undefined) setTextColor(settings.textColor);
    if (settings.textShadow !== undefined) setTextShadow(typeof settings.textShadow === 'boolean' ? (settings.textShadow ? 8 : 0) : settings.textShadow);
    if (settings.fontWeight !== undefined) setFontWeight(settings.fontWeight);
    if (settings.textPosition !== undefined) setTextPosition(settings.textPosition);
    if (settings.fontSize !== undefined) setFontSize(settings.fontSize);
    toast.success('Template loaded');
  }, []);

  /**
   * Translate current text lines into all App Store locales
   *
   * Sets English locales to source text, then calls the batch
   * translation API for all other locales with progress tracking.
   */
  /**
   * Toggle a locale in the selected set
   *
   * @param {string} code - Locale code to toggle
   */
  function toggleLocale(code) {
    setSelectedLocales((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  /** Select all non-English locales */
  function selectAllLocales() {
    setSelectedLocales(new Set(LOCALES.filter((l) => !ENGLISH_LOCALES.has(l.code)).map((l) => l.code)));
  }

  /** Deselect all locales */
  function deselectAllLocales() {
    setSelectedLocales(new Set());
  }

  const handleTranslateSelected = useCallback(async () => {
    if (!textLine1.trim() && !textLine2.trim()) {
      toast.error('Enter marketing text first');
      return;
    }
    if (selectedLocales.size === 0) {
      toast.error('Select at least one language');
      return;
    }

    setIsTranslating(true);
    setTranslationProgress(0);
    setShowTranslations(true);

    const newTranslations = { ...translations };

    // Set English locales to original
    for (const code of ENGLISH_LOCALES) {
      if (selectedLocales.has(code)) {
        newTranslations[code] = { line1: textLine1, line2: textLine2, status: 'original' };
      }
    }

    const toTranslate = LOCALES.filter((l) => selectedLocales.has(l.code) && !ENGLISH_LOCALES.has(l.code));
    let completed = 0;

    // Mark selected non-English locales as "translating"
    for (const locale of toTranslate) {
      newTranslations[locale.code] = { line1: '', line2: '', status: 'translating' };
    }
    setTranslations({ ...newTranslations });

    for (const locale of toTranslate) {
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
      setTranslationProgress(Math.round((completed / toTranslate.length) * 100));
      setTranslations({ ...newTranslations });
    }

    setIsTranslating(false);
    setTranslationProgress(100);
    toast.success(`Translated ${toTranslate.length} languages`);
  }, [textLine1, textLine2, selectedLocales, translations]);

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

  /**
   * Export translated screenshots as individual PNG downloads
   *
   * Iterates all translated locales, renders each with locale-specific
   * text via an offscreen canvas, and triggers a file download per locale.
   */
  const handleExportTranslated = useCallback(async () => {
    if (!hasTranslations) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const baseState = {
      device, showBezel, screenshotImage,
      textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
      bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage,
      autoFitText, fontFamily: selectedFont,
      frameImage, frameModelInfo: frameModel ? FRAME_MODELS[frameModel] : null,
      frameLayout
    };

    for (const locale of LOCALES) {
      const t = translations[locale.code];
      if (!t || t.status === 'error') continue;

      const blob = await renderForLocale(canvas, baseState, locale.code, t.line1, t.line2);
      if (!blob) continue;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `screenshot-${locale.code}-${device}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    toast.success('Translated screenshots exported');
  }, [translations, hasTranslations, device, showBezel, screenshotImage, textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight, bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage, autoFitText, selectedFont, frameImage, frameModel, frameLayout]);

  // Load frame PNG when model or color changes
  useEffect(() => {
    if (!frameModel || !frameColor) {
      setFrameImage(null);
      return;
    }
    loadFrame(frameModel, frameColor, orientation)
      .then(setFrameImage)
      .catch(() => {
        toast.error('Failed to load device frame');
        setFrameImage(null);
      });
  }, [frameModel, frameColor, orientation]);

  /**
   * Handle frame model change from the dropdown — sets device tier, color, and bezel
   *
   * @param {string} modelKey - Frame model key from FRAME_MODELS, or '' to clear
   */
  function handleFrameModelChange(modelKey) {
    if (modelKey && FRAME_MODELS[modelKey]) {
      const model = FRAME_MODELS[modelKey];
      setFrameModel(modelKey);
      setDevice(model.ascTier);
      setFrameColor(model.defaultColor);
      setShowBezel(true);
    } else {
      setFrameModel('');
      setFrameColor('');
      setFrameImage(null);
    }
  }

  /**
   * Handle device change from the dropdown — auto-selects matching frame model
   *
   * @param {string} deviceKey - Device key from DEVICES
   */
  function handleDeviceChange(deviceKey) {
    setDevice(deviceKey);
    // If current frame model already matches, keep it
    if (frameModel && FRAME_MODELS[frameModel]?.ascTier === deviceKey) return;
    // Find first frame model matching this device tier
    const match = Object.entries(FRAME_MODELS).find(([, m]) => m.ascTier === deviceKey);
    if (match) {
      setFrameModel(match[0]);
      setFrameColor(match[1].defaultColor);
    } else {
      setFrameModel('');
      setFrameColor('');
      setFrameImage(null);
    }
  }

  // Redraw canvas whenever any setting changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isEnglishLocale = ENGLISH_LOCALES.has(previewLocale);
    const previewLine1 = !isEnglishLocale && translations[previewLocale]?.line1 ? translations[previewLocale].line1 : textLine1;
    const previewLine2 = !isEnglishLocale && translations[previewLocale]?.line2 ? translations[previewLocale].line2 : textLine2;

    drawComposite(canvas, {
      device, showBezel, screenshotImage,
      textLine1: previewLine1, textLine2: previewLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
      bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage,
      autoFitText, fontFamily: selectedFont, editingLine, layers,
      frameImage, frameModelInfo: frameModel ? FRAME_MODELS[frameModel] : null,
      frameLayout, orientation
    });
  }, [
    device, showBezel, screenshotImage,
    textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
    bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage,
    autoFitText, selectedFont, previewLocale, translations, editingLine, layers,
    frameImage, frameModel, frameLayout, orientation
  ]);


  return (
    <>
      <Header title="" className="[&>div>div:last-child]:ml-0 [&>div>div:last-child]:flex-1">
        <AppPicker />
        {selectedApp && (
          <Select value={previewLocale === 'original' ? 'en-US' : previewLocale} onValueChange={setPreviewLocale}>
            <SelectTrigger className="h-8 w-44" aria-label="Preview locale for screenshot text">
              <SelectValue>
                {LOCALES.find((l) => l.code === (previewLocale === 'original' ? 'en-US' : previewLocale))?.name || 'English (US)'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((locale) => {
                const t = translations[locale.code];
                const status = t?.status;
                return (
                  <SelectItem key={locale.code} value={locale.code}>
                    {locale.name}
                    {status === 'translated' ? ' ✓' : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
        <Select value={device} onValueChange={handleDeviceChange}>
          <SelectTrigger className="h-8 w-56 text-xs" aria-label="Select device size">
            <SelectValue>
              {currentDevice.label} — {orientation === 'landscape' ? currentDevice.height : currentDevice.width} × {orientation === 'landscape' ? currentDevice.width : currentDevice.height}px
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DEVICE_OPTIONS.map((d) => {
              const info = DEVICES[d.key];
              const requiredLabel = d.key === 'iphone-69' ? ' ★' : d.key === 'ipad-13' ? ' ★ iPad' : '';
              return (
                <SelectItem key={d.key} value={d.key}>
                  {d.label} — {orientation === 'landscape' ? info.height : info.width} × {orientation === 'landscape' ? info.width : info.height}px{requiredLabel}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanelOpen((v) => !v)}
          aria-label={panelOpen ? 'Hide tools panel' : 'Show tools panel'}
          aria-expanded={panelOpen}
          aria-controls="screenshot-settings-panel"
        >
          {panelOpen ? 'Hide Tools' : 'Show Tools'}
        </Button>
      </Header>
      {!selectedApp ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Select an app to get started</p>
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Canvas Preview */}
        <section
          className={`relative flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-4 md:p-6 transition-colors ${isDraggingOver ? 'bg-primary/5' : ''}`}
          aria-label="Screenshot preview"
          onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setIsDraggingOver(true); }}
          onDragLeave={() => { dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDraggingOver(false); } }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { dragCounterRef.current = 0; setIsDraggingOver(false); handleDrop(e); }}
        >
          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-primary/5">
              <p className="text-sm font-medium text-primary/70">Drop screenshot here</p>
            </div>
          )}
            <div
              ref={canvasContainerRef}
              className="relative w-full transition-all duration-300 ease-in-out"
              style={{ maxWidth: canvasMaxWidth }}
            >
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                style={{ width: '100%', height: 'auto', borderRadius: '8px' }}
                aria-label="Composed screenshot preview"
              />
              {editingLine === 1 && (
                <input
                  type="text"
                  value={!ENGLISH_LOCALES.has(previewLocale) ? (translations[previewLocale]?.line1 ?? textLine1) : textLine1}
                  onChange={(e) => {
                    if (!ENGLISH_LOCALES.has(previewLocale)) {
                      if (!translations[previewLocale]) {
                        setTranslations((prev) => ({ ...prev, [previewLocale]: { line1: e.target.value, line2: textLine2, status: 'modified' } }));
                      } else {
                        handleCellEdit(previewLocale, 'line1', e.target.value);
                      }
                    } else {
                      setTextLine1(e.target.value);
                    }
                  }}
                  onBlur={() => setEditingLine(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingLine(null); if (e.key === 'Tab') { e.preventDefault(); setEditingLine(2); } }}
                  style={getTextOverlayStyle(1)}
                  autoFocus
                  aria-label="Edit marketing text line 1"
                />
              )}
              {editingLine === 2 && (
                <input
                  type="text"
                  value={!ENGLISH_LOCALES.has(previewLocale) ? (translations[previewLocale]?.line2 ?? textLine2) : textLine2}
                  onChange={(e) => {
                    if (!ENGLISH_LOCALES.has(previewLocale)) {
                      if (!translations[previewLocale]) {
                        setTranslations((prev) => ({ ...prev, [previewLocale]: { line1: textLine1, line2: e.target.value, status: 'modified' } }));
                      } else {
                        handleCellEdit(previewLocale, 'line2', e.target.value);
                      }
                    } else {
                      setTextLine2(e.target.value);
                    }
                  }}
                  onBlur={() => setEditingLine(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingLine(null); if (e.key === 'Tab') { e.preventDefault(); setEditingLine(1); } }}
                  style={getTextOverlayStyle(2)}
                  autoFocus
                  aria-label="Edit marketing text line 2"
                />
              )}
            </div>
          </section>

          {/* Right: Tools Panel */}
          <aside
            id="screenshot-settings-panel"
            className={`sticky top-0 h-[calc(100vh-var(--header-height)-1px)] flex-col border-l border-border/50 bg-background overflow-y-auto transition-all duration-300 ease-in-out ${panelOpen ? 'flex w-72 min-w-72 opacity-100' : 'hidden w-0 min-w-0 opacity-0 pointer-events-none'}`}
            aria-label="Screenshot settings"
            aria-hidden={!panelOpen}
          >
            {/* ── BACKGROUND ── */}
            <div className="border-b border-border/40 px-3 py-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Background</h3>
              <div className="flex flex-col gap-2">
                {/* Segment control */}
                <div className="flex rounded-md border border-border/50 p-0.5" role="tablist" aria-label="Background type">
                  {[{ id: 'fill', label: 'Fill' }, { id: 'upload', label: 'Image' }, { id: 'generate', label: 'AI' }].map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={bgTab === tab.id}
                      onClick={() => setBgTab(tab.id)}
                      className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${bgTab === tab.id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Fill tab */}
                {bgTab === 'fill' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Color</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-muted-foreground/70">{bgColor}</span>
                        <input type="color" id="bg-color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-6 w-6 cursor-pointer rounded border border-border/60 p-0" aria-label="Background color" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Gradient</span>
                      <Switch id="gradient-toggle" checked={isGradient} onCheckedChange={setIsGradient} aria-label="Toggle gradient background" className="scale-75" />
                    </div>
                    {isGradient && (
                      <div className="flex flex-col gap-1.5 border-l-2 border-border/30 pl-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Start</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-muted-foreground/70">{gradientStart}</span>
                            <input type="color" id="grad-start" value={gradientStart} onChange={(e) => setGradientStart(e.target.value)} className="h-5 w-5 cursor-pointer rounded border border-border/60 p-0" aria-label="Gradient start color" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">End</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-muted-foreground/70">{gradientEnd}</span>
                            <input type="color" id="grad-end" value={gradientEnd} onChange={(e) => setGradientEnd(e.target.value)} className="h-5 w-5 cursor-pointer rounded border border-border/60 p-0" aria-label="Gradient end color" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Direction</span>
                          <Select value={gradientDirection} onValueChange={setGradientDirection}>
                            <SelectTrigger id="grad-direction" className="h-7 w-32 border-0 bg-transparent text-xs shadow-none" aria-label="Gradient direction">
                              <SelectValue>{GRADIENT_DIRECTIONS.find((d) => d.value === gradientDirection)?.label || 'Top to Bottom'}</SelectValue>
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
                  </div>
                )}

                {/* Image tab */}
                {bgTab === 'upload' && (
                  <div className="flex flex-col gap-2">
                    <div
                      className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-border/60 bg-accent/10 p-3 transition-colors hover:bg-accent/30"
                      onClick={() => document.getElementById('bg-upload').click()}
                      role="button"
                      tabIndex={0}
                      aria-label="Upload background image"
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('bg-upload').click(); } }}
                    >
                      {bgImage ? (
                        <p className="text-xs text-foreground">Image loaded — click to replace</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Click to upload image</p>
                      )}
                    </div>
                    {bgImage && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setBgImage(null)} aria-label="Remove background image">
                        Remove Image
                      </Button>
                    )}
                  </div>
                )}
                <input type="file" id="bg-upload" accept="image/*" onChange={handleBgUpload} className="hidden" aria-label="Background image file input" />

                {/* AI tab */}
                {bgTab === 'generate' && (
                  <div className="flex flex-col gap-1.5">
                    <Input id="ai-bg-prompt" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Describe a background..." disabled={isGeneratingBg} onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateBg(); }} aria-label="AI background description" className="h-7 text-xs" />
                    <Button size="sm" className="h-7 text-xs" onClick={handleGenerateBg} disabled={isGeneratingBg || !aiPrompt.trim()} aria-label="Generate AI background">
                      {isGeneratingBg ? <Spinner className="h-3 w-3" /> : 'Generate Background'}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ── TEXT ── */}
            <div className="border-b border-border/40 px-3 py-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Text</h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Position</span>
                  <Select value={textPosition} onValueChange={setTextPosition}>
                    <SelectTrigger id="text-position" className="h-7 w-24 border-0 bg-transparent text-xs shadow-none" aria-label="Text position">
                      <SelectValue>{textPosition === 'top' ? 'Top' : 'Bottom'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Top</SelectItem>
                      <SelectItem value="bottom">Bottom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Weight</span>
                  <Select value={fontWeight} onValueChange={setFontWeight}>
                    <SelectTrigger id="font-weight" className="h-7 w-24 border-0 bg-transparent text-xs shadow-none" aria-label="Font weight">
                      <SelectValue>{fontWeight}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_OPTIONS.map((w) => (
                        <SelectItem key={w} value={w}>{w}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Size</span>
                  <Input id="font-size-input" type="number" min={12} max={120} value={fontSize} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 12 && v <= 120) setFontSize(v); }} aria-label="Font size in pixels" className="h-7 w-16 border-0 bg-transparent text-xs text-right tabular-nums shadow-none" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Color</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground/70">{textColor}</span>
                    <input type="color" id="text-color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-5 w-5 cursor-pointer rounded border border-border/60 p-0" aria-label="Text color" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Shadow</span>
                  <Input id="text-shadow-input" type="number" min={0} max={50} value={textShadow} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0 && v <= 50) setTextShadow(v); }} aria-label="Text shadow blur radius" className="h-7 w-16 border-0 bg-transparent text-xs text-right tabular-nums shadow-none" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Font</span>
                  <Select value={selectedFont || 'system-default'} onValueChange={(val) => setSelectedFont(val === 'system-default' ? '' : val)}>
                    <SelectTrigger className="h-7 w-32 border-0 bg-transparent text-xs shadow-none" aria-label="Font family">
                      <SelectValue>{selectedFont || 'System Default'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system-default">System Default</SelectItem>
                      {GOOGLE_FONTS.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Auto-fit</span>
                  <Switch id="autofit-toggle" checked={autoFitText} onCheckedChange={setAutoFitText} aria-label="Toggle auto-fit text sizing" className="scale-75" />
                </div>
              </div>
            </div>

            {/* ── TEMPLATES & FONTS ── */}
            <div className="border-b border-border/40">
              <TemplatePanel
                currentState={{
                  bgColor, isGradient, gradientStart, gradientEnd, gradientDirection,
                  textColor, textShadow, fontWeight, textPosition, fontSize
                }}
                onLoadTemplate={handleLoadTemplate}
                appId={selectedApp?.id}
                selectedFont={selectedFont}
                onFontChange={setSelectedFont}
              />
            </div>

            {/* ── DEVICE ── */}
            <div className="border-b border-border/40 px-3 py-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Device</h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Model</span>
                  <Select value={frameModel} onValueChange={(val) => handleFrameModelChange(val === 'none' ? '' : val)}>
                    <SelectTrigger className="h-7 w-40 border-0 bg-transparent text-xs shadow-none" aria-label="Select device frame model">
                      <SelectValue>{frameModel && FRAME_MODELS[frameModel] ? FRAME_MODELS[frameModel].label : 'No frame'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No frame</SelectItem>
                      {['iPhone', 'iPad'].map((group) => (
                        <div key={group}>
                          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">{group}</div>
                          {Object.entries(FRAME_MODELS)
                            .filter(([, m]) => m.group === group)
                            .map(([key, m]) => (
                              <SelectItem key={key} value={key}>{m.label}</SelectItem>
                            ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {frameModel && FRAME_MODELS[frameModel] && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <div className="flex overflow-hidden rounded-md border border-border/50 p-0.5" role="tablist" aria-label="Device frame color">
                      {FRAME_MODELS[frameModel].colors.map((c) => (
                        <button
                          key={c.slug}
                          role="tab"
                          aria-selected={frameColor === c.slug}
                          onClick={() => setFrameColor(c.slug)}
                          className={`min-w-0 flex-1 truncate rounded px-1.5 py-1 text-xs transition-colors ${frameColor === c.slug ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                          aria-label={`Select ${c.label} frame color`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Layout</span>
                  <div className="flex rounded-md border border-border/50 p-0.5" role="tablist" aria-label="Device layout">
                    {[{ id: 'full', label: 'Normal' }, { id: 'zoomed', label: 'Zoomed' }, { id: 'fullscreen', label: 'Full' }].map((opt) => (
                      <button
                        key={opt.id}
                        role="tab"
                        aria-selected={frameLayout === opt.id}
                        onClick={() => setFrameLayout(opt.id)}
                        className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${frameLayout === opt.id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Orientation</span>
                  <div className="flex rounded-md border border-border/50 p-0.5" role="tablist" aria-label="Device orientation">
                    {[{ id: 'portrait', label: 'Portrait' }, { id: 'landscape', label: 'Landscape' }].map((opt) => (
                      <button
                        key={opt.id}
                        role="tab"
                        aria-selected={orientation === opt.id}
                        onClick={() => setOrientation(opt.id)}
                        className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${orientation === opt.id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {!frameModel && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Frame</span>
                    <Switch id="bezel-toggle" checked={showBezel} onCheckedChange={setShowBezel} aria-label="Toggle device frame bezel" className="scale-75" />
                  </div>
                )}
                <input type="file" id="screenshot-upload" accept="image/*" onChange={handleScreenshotUpload} className="hidden" aria-label="Screenshot file input" />
              </div>
            </div>

            {/* ── LOCALIZATION ── */}
            <div className="border-b border-border/40 px-3 py-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Localization</h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <Button size="sm" className="h-7 flex-1 text-xs" onClick={handleTranslateSelected} disabled={isTranslating || selectedLocales.size === 0 || (!textLine1.trim() && !textLine2.trim())} aria-label="Translate selected locales">
                    {isTranslating ? 'Translating...' : `Translate (${selectedLocales.size})`}
                  </Button>
                  {hasTranslations && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCopyAll} disabled={isTranslating} aria-label="Copy all translations as JSON">
                      Copy
                    </Button>
                  )}
                </div>

                {isTranslating && (
                  <div className="flex flex-col gap-1" role="status" aria-live="polite">
                    <Progress value={translationProgress} aria-label="Translation progress" className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">{translationProgress}%</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button onClick={selectAllLocales} className="text-[10px] text-muted-foreground hover:text-foreground" aria-label="Select all locales">All</button>
                  <button onClick={deselectAllLocales} className="text-[10px] text-muted-foreground hover:text-foreground" aria-label="Deselect all locales">None</button>
                </div>

                <ScrollArea className="h-[280px]">
                  <div className="flex flex-col">
                    {LOCALES.filter((l) => !ENGLISH_LOCALES.has(l.code)).map((locale) => {
                      const t = translations[locale.code];
                      const status = t?.status || 'waiting';
                      const { label, variant } = getStatusBadge(status);
                      const isChecked = selectedLocales.has(locale.code);
                      return (
                        <button
                          key={locale.code}
                          onClick={() => toggleLocale(locale.code)}
                          className={`flex items-center justify-between rounded px-1.5 py-1 text-left transition-colors hover:bg-accent/30 ${isChecked ? '' : 'opacity-50'}`}
                          aria-label={`${isChecked ? 'Deselect' : 'Select'} ${locale.name}`}
                          aria-pressed={isChecked}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] leading-none ${isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60'}`}>
                              {isChecked ? '✓' : ''}
                            </span>
                            <span className="text-[11px]">{locale.name}</span>
                          </div>
                          {status !== 'waiting' && (
                            <Badge variant={variant} className="text-[8px] px-1 py-0">{label}</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* ── LAYERS ── */}
            <div className="border-b border-border/40 px-3 py-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Layers</h3>
              <div className="flex flex-col gap-0.5">
                {[
                  { key: 'headline', label: 'Headline' },
                  { key: 'subheadline', label: 'Subheadline' },
                  { key: 'device', label: 'Device' },
                  { key: 'background', label: 'Background' },
                ].map((layer) => (
                  <button
                    key={layer.key}
                    onClick={() => toggleLayer(layer.key)}
                    className={`flex items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-accent/30 ${layers[layer.key] ? '' : 'opacity-40'}`}
                    aria-label={`${layers[layer.key] ? 'Hide' : 'Show'} ${layer.label} layer`}
                    aria-pressed={layers[layer.key]}
                  >
                    {layers[layer.key] ? (
                      <Eye className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground/30" aria-hidden="true" />
                    )}
                    <span className="text-xs">{layer.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── EXPORT ── */}
            <div className="px-3 py-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Export</h3>
              <div className="flex flex-col gap-1.5">
                <Button size="sm" className="h-7 text-xs" onClick={handleExport} aria-label="Export composed screenshot as PNG">
                  Export PNG
                </Button>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => setShowPreviewAll(true)} aria-label="Preview screenshot at all device sizes">
                    Preview All
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => setShowBatchExport(true)} disabled={!hasTranslations} aria-label="Open batch export dialog">
                    Batch Export
                  </Button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground/50">
                  {currentDevice.width} &times; {currentDevice.height}px
                </p>
              </div>
            </div>
          </aside>
      </div>
      )}

      {/* Preview All Sizes Dialog */}
      <Dialog open={showPreviewAll} onOpenChange={setShowPreviewAll}>
        <DialogContent className="!max-w-[calc(100vw-2rem)] w-full h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Preview All Sizes</DialogTitle>
          </DialogHeader>
          <div className="flex-1 grid grid-cols-4 grid-rows-2 gap-4 min-h-0">
            {DEVICE_OPTIONS.map((d) => {
              const dev = DEVICES[d.key];
              return (
                <div key={d.key} className="flex flex-col items-center gap-1 min-h-0 overflow-hidden">
                  <canvas
                    ref={(el) => {
                      if (!el || !showPreviewAll) return;
                      const previewLine1 = !ENGLISH_LOCALES.has(previewLocale) && translations[previewLocale]?.line1 ? translations[previewLocale].line1 : textLine1;
                      const previewLine2 = !ENGLISH_LOCALES.has(previewLocale) && translations[previewLocale]?.line2 ? translations[previewLocale].line2 : textLine2;

                      // Find matching frame model for this device tier
                      const matchingEntry = Object.entries(FRAME_MODELS).find(([, m]) => m.ascTier === d.key);
                      const baseState = {
                        device: d.key, showBezel, screenshotImage,
                        textLine1: previewLine1, textLine2: previewLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
                        bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage,
                        autoFitText, fontFamily: selectedFont,
                        frameLayout, orientation
                      };

                      if (matchingEntry) {
                        const [modelKey, modelInfo] = matchingEntry;
                        loadFrame(modelKey, modelInfo.defaultColor, orientation)
                          .then((img) => {
                            drawComposite(el, { ...baseState, frameImage: img, frameModelInfo: modelInfo });
                          })
                          .catch(() => {
                            drawComposite(el, { ...baseState, frameImage: null, frameModelInfo: null });
                          });
                      } else {
                        drawComposite(el, { ...baseState, frameImage: null, frameModelInfo: null });
                      }
                    }}
                    style={{ width: 'auto', maxWidth: '100%', maxHeight: '100%', borderRadius: '4px' }}
                    aria-label={`Preview for ${d.label}`}
                  />
                  <p className="shrink-0 text-xs text-muted-foreground text-center">
                    {d.label}
                    <br />
                    {orientation === 'landscape' ? dev.height : dev.width}x{orientation === 'landscape' ? dev.width : dev.height}
                  </p>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Export Dialog */}
      <BatchExportDialog
        open={showBatchExport}
        onOpenChange={setShowBatchExport}
        baseState={{
          device, showBezel, screenshotImage,
          textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
          bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage,
          autoFitText, fontFamily: selectedFont,
          frameImage, frameModelInfo: frameModel ? FRAME_MODELS[frameModel] : null,
          frameLayout, orientation
        }}
        translations={translations}
        appName={selectedApp?.name}
        appId={selectedApp?.id}
      />
    </>
  );
}
