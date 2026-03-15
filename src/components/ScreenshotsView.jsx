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
import { useState, useRef, useEffect, useCallback } from 'react';
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

export default function ScreenshotsView() {
  const { selectedApp } = useApp();
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const [editingLine, setEditingLine] = useState(null);

  // Background state
  const [bgTab, setBgTab] = useState('fill');
  const [bgColor, setBgColor] = useState('#1a1a2e');
  const [isGradient, setIsGradient] = useState(false);
  const [gradientStart, setGradientStart] = useState('#1a1a2e');
  const [gradientEnd, setGradientEnd] = useState('#16213e');
  const [gradientDirection, setGradientDirection] = useState('top-bottom');
  const [bgImage, setBgImage] = useState(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);

  // Text state
  const [textLine1, setTextLine1] = useState('Track Your Fitness');
  const [textLine2, setTextLine2] = useState('Reach Your Goals');
  const [textPosition, setTextPosition] = useState('top');
  const [fontSize, setFontSize] = useState(100);
  const [textColor, setTextColor] = useState('#ffffff');
  const [textShadow, setTextShadow] = useState(true);
  const [fontWeight, setFontWeight] = useState('Bold');
  const [autoFitText, setAutoFitText] = useState(true);

  // Font state (from templates)
  const [selectedFont, setSelectedFont] = useState('');

  // Device state
  const [device, setDevice] = useState('iphone-65');
  const [showBezel, setShowBezel] = useState(true);
  const [screenshotImage, setScreenshotImage] = useState(null);

  // Device frame PNG state
  const [frameModel, setFrameModel] = useState('iphone-17-pro');
  const [frameColor, setFrameColor] = useState('silver');
  const [frameImage, setFrameImage] = useState(null);
  const [frameLayout, setFrameLayout] = useState('full');

  // Localization state
  const [translations, setTranslations] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [showTranslations, setShowTranslations] = useState(false);
  const [previewLocale, setPreviewLocale] = useState('original');

  // Layer visibility
  const [layers, setLayers] = useState({
    background: true, device: true, headline: true, subheadline: true
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
    textPosition: 'top', fontSize: 100, textColor: '#ffffff', textShadow: true, fontWeight: 'Bold',
    autoFitText: true, device: 'iphone-65', showBezel: true, selectedFont: '',
    frameModel: 'iphone-17-pro', frameColor: 'silver', frameLayout: 'full'
  });

  const currentDevice = DEVICES[device];
  const hasTranslations = Object.keys(translations).length > 0;

  // Push current settings to history (debounced, skip during restore)
  useEffect(() => {
    if (isRestoringRef.current) return;
    const timer = setTimeout(() => {
      pushState({
        bgColor, isGradient, gradientStart, gradientEnd, gradientDirection,
        textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
        autoFitText, device, showBezel, selectedFont, frameModel, frameColor, frameLayout
      });
    }, HISTORY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    bgColor, isGradient, gradientStart, gradientEnd, gradientDirection,
    textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
    autoFitText, device, showBezel, selectedFont, frameModel, frameColor, frameLayout, pushState
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
    if (settings.textShadow !== undefined) setTextShadow(settings.textShadow);
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
    loadFrame(frameModel, frameColor, 'portrait')
      .then(setFrameImage)
      .catch(() => {
        toast.error('Failed to load device frame');
        setFrameImage(null);
      });
  }, [frameModel, frameColor]);

  // Auto-set ASC tier and default color when frame model changes
  useEffect(() => {
    if (frameModel && FRAME_MODELS[frameModel]) {
      const model = FRAME_MODELS[frameModel];
      setDevice(model.ascTier);
      setFrameColor(model.defaultColor);
      setShowBezel(true);
    }
  }, [frameModel]);

  // Redraw canvas whenever any setting changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const previewLine1 = previewLocale !== 'original' && translations[previewLocale]?.line1 ? translations[previewLocale].line1 : textLine1;
    const previewLine2 = previewLocale !== 'original' && translations[previewLocale]?.line2 ? translations[previewLocale].line2 : textLine2;

    drawComposite(canvas, {
      device, showBezel, screenshotImage,
      textLine1: previewLine1, textLine2: previewLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
      bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage,
      autoFitText, fontFamily: selectedFont, editingLine, layers,
      frameImage, frameModelInfo: frameModel ? FRAME_MODELS[frameModel] : null,
      frameLayout
    });
  }, [
    device, showBezel, screenshotImage,
    textLine1, textLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
    bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage,
    autoFitText, selectedFont, previewLocale, translations, editingLine, layers,
    frameImage, frameModel, frameLayout
  ]);


  return (
    <>
      <Header title="" className="[&>div>div:last-child]:ml-0 [&>div>div:last-child]:flex-1">
        <AppPicker />
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
          className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-4 md:p-6"
          aria-label="Screenshot preview"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
            <div
              ref={canvasContainerRef}
              className={`relative w-full cursor-text transition-all duration-300 ease-in-out ${panelOpen ? 'max-w-lg' : 'max-w-xl'}`}
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
                  value={textLine1}
                  onChange={(e) => setTextLine1(e.target.value)}
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
                  value={textLine2}
                  onChange={(e) => setTextLine2(e.target.value)}
                  onBlur={() => setEditingLine(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingLine(null); if (e.key === 'Tab') { e.preventDefault(); setEditingLine(1); } }}
                  style={getTextOverlayStyle(2)}
                  autoFocus
                  aria-label="Edit marketing text line 2"
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {currentDevice.width} &times; {currentDevice.height}px &mdash; {currentDevice.label}
            </p>

            {/* Device Size Picker */}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {DEVICE_OPTIONS.map((d) => {
                const info = DEVICES[d.key];
                const aspect = info.width / info.height;
                const isSelected = device === d.key;
                const h = 44;
                const w = Math.round(h * aspect);
                return (
                  <button
                    key={d.key}
                    onClick={() => setDevice(d.key)}
                    className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors ${isSelected ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-accent/50'}`}
                    aria-label={`Select ${d.label}`}
                    aria-pressed={isSelected}
                  >
                    <div
                      className={`flex items-center justify-center ${isSelected ? 'bg-primary/20 text-primary' : 'bg-accent text-muted-foreground'}`}
                      style={{ width: `${w}px`, height: `${h}px`, borderRadius: info.radius > 0 ? '5px' : '2px' }}
                    >
                      <span className="text-[8px] font-medium">{d.label.replace('iPhone ', '').replace('iPad ', '')}</span>
                    </div>
                  </button>
                );
              })}
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
              <p className="mb-2 text-xs text-muted-foreground/50">Click text on canvas to edit</p>
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
                  <Switch id="text-shadow-toggle" checked={textShadow} onCheckedChange={setTextShadow} aria-label="Toggle text shadow" className="scale-75" />
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
                  <Select value={frameModel} onValueChange={(val) => setFrameModel(val === 'none' ? '' : val)}>
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
                    <div className="flex flex-wrap gap-1">
                      {FRAME_MODELS[frameModel].colors.map((c) => (
                        <button
                          key={c.slug}
                          onClick={() => setFrameColor(c.slug)}
                          className={`rounded px-2 py-0.5 text-[10px] transition-colors ${frameColor === c.slug ? 'bg-primary text-primary-foreground' : 'bg-accent/50 text-muted-foreground hover:bg-accent'}`}
                          aria-label={`Select ${c.label} frame color`}
                          aria-pressed={frameColor === c.slug}
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
                {!frameModel && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Frame</span>
                    <Switch id="bezel-toggle" checked={showBezel} onCheckedChange={setShowBezel} aria-label="Toggle device frame bezel" className="scale-75" />
                  </div>
                )}
                <div
                  className="flex min-h-10 cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-border/60 bg-accent/10 p-2 transition-colors hover:bg-accent/30"
                  onClick={() => document.getElementById('screenshot-upload').click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload screenshot — click to browse or drop anywhere on canvas"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      document.getElementById('screenshot-upload').click();
                    }
                  }}
                >
                  {screenshotImage ? (
                    <p className="text-xs text-foreground">Screenshot loaded — click to replace</p>
                  ) : (
                    <p className="text-xs font-medium text-muted-foreground">Browse or drop on canvas</p>
                  )}
                </div>
                <input type="file" id="screenshot-upload" accept="image/*" onChange={handleScreenshotUpload} className="hidden" aria-label="Screenshot file input" />
              </div>
            </div>

            {/* ── LOCALIZATION ── */}
            <div className="border-b border-border/40 px-3 py-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Localization</h3>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" className="h-7 text-xs" onClick={handleTranslateAll} disabled={isTranslating || (!textLine1.trim() && !textLine2.trim())} aria-label="Translate text into all locales">
                    {isTranslating ? 'Translating...' : 'Translate All'}
                  </Button>
                  {hasTranslations && (
                    <>
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setShowTranslations(!showTranslations)} aria-label={showTranslations ? 'Hide translations table' : 'Show translations table'}>
                        {showTranslations ? 'Hide' : 'Show'} ({Object.keys(translations).length})
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={handleCopyAll} disabled={isTranslating} aria-label="Copy all translations as JSON">
                        Copy
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={handleExportTranslated} disabled={isTranslating} aria-label="Export all translated screenshots as PNGs">
                        Export
                      </Button>
                    </>
                  )}
                </div>

                {hasTranslations && (
                  <Select value={previewLocale} onValueChange={setPreviewLocale}>
                    <SelectTrigger id="preview-locale" className="h-7 text-xs" aria-label="Preview locale on canvas">
                      <SelectValue>{previewLocale === 'original' ? 'Original' : LOCALES.find((l) => l.code === previewLocale)?.name || 'Original'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original">Original</SelectItem>
                      {LOCALES.map((l) => translations[l.code] ? (
                        <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                      ) : null)}
                    </SelectContent>
                  </Select>
                )}

                {isTranslating && (
                  <div className="flex flex-col gap-1" role="status" aria-live="polite">
                    <Progress value={translationProgress} aria-label="Translation progress" className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">{translationProgress}%</p>
                  </div>
                )}

                {showTranslations && hasTranslations && (
                  <ScrollArea className="h-[300px] rounded border border-border/40">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px] text-[10px]">Lang</TableHead>
                          <TableHead className="text-[10px]">Line 1</TableHead>
                          <TableHead className="text-[10px]">Line 2</TableHead>
                          <TableHead className="w-[60px] text-[10px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {LOCALES.map((locale) => {
                          const t = translations[locale.code];
                          if (!t) return null;
                          const { label, variant } = getStatusBadge(t.status);
                          return (
                            <TableRow key={locale.code}>
                              <TableCell className="text-[10px] font-medium">{locale.name}</TableCell>
                              <TableCell>
                                <Input value={t.line1} onChange={(e) => handleCellEdit(locale.code, 'line1', e.target.value)} disabled={isTranslating} aria-label={`${locale.name} line 1 translation`} className="h-6 text-xs" />
                              </TableCell>
                              <TableCell>
                                <Input value={t.line2} onChange={(e) => handleCellEdit(locale.code, 'line2', e.target.value)} disabled={isTranslating} aria-label={`${locale.name} line 2 translation`} className="h-6 text-xs" />
                              </TableCell>
                              <TableCell>
                                <Badge variant={variant} className="text-[9px]">{label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
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
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview All Sizes</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {DEVICE_OPTIONS.map((d) => {
              const dev = DEVICES[d.key];
              return (
                <div key={d.key} className="flex flex-col items-center gap-1">
                  <canvas
                    ref={(el) => {
                      if (!el || !showPreviewAll) return;
                      const previewLine1 = previewLocale !== 'original' && translations[previewLocale]?.line1 ? translations[previewLocale].line1 : textLine1;
                      const previewLine2 = previewLocale !== 'original' && translations[previewLocale]?.line2 ? translations[previewLocale].line2 : textLine2;
                      const frameInfo = frameModel ? FRAME_MODELS[frameModel] : null;
                      const useFrame = frameInfo && frameInfo.ascTier === d.key;
                      drawComposite(el, {
                        device: d.key, showBezel, screenshotImage,
                        textLine1: previewLine1, textLine2: previewLine2, textPosition, fontSize, textColor, textShadow, fontWeight,
                        bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage,
                        autoFitText, fontFamily: selectedFont,
                        frameImage: useFrame ? frameImage : null,
                        frameModelInfo: useFrame ? frameInfo : null,
                        frameLayout
                      });
                    }}
                    style={{ width: '100%', height: 'auto', borderRadius: '4px' }}
                    aria-label={`Preview for ${d.label}`}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    {d.label}
                    <br />
                    {dev.width}x{dev.height}
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
          frameLayout
        }}
        translations={translations}
        appName={selectedApp?.name}
        appId={selectedApp?.id}
      />
    </>
  );
}
