/**
 * Metadata editing view with AI-powered generation via x.ai Grok
 *
 * Provides a locale-tabbed form for App Store Connect localized listings
 * with character counts, per-field AI generation, bulk generation,
 * auto-translation, keyword suggestions, diff preview, and version history.
 *
 * @component
 * @returns {JSX.Element} Metadata management interface
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Textarea } from '@stevederico/skateboard-ui/shadcn/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@stevederico/skateboard-ui/shadcn/ui/sheet';
import { ScrollArea } from '@stevederico/skateboard-ui/shadcn/ui/scroll-area';
import { Progress } from '@stevederico/skateboard-ui/shadcn/ui/progress';
import { toast } from 'sonner';
import { useApp } from './AppContext.jsx';
import AppPicker from './AppPicker.jsx';

/** Tone options for AI metadata generation */
const TONE_OPTIONS = ['Professional', 'Casual', 'Motivational', 'Playful', 'Technical'];

/** Initial empty metadata state */
const EMPTY_METADATA = {
  name: '',
  subtitle: '',
  description: '',
  keywords: '',
  whatsNew: '',
  supportUrl: '',
  marketingUrl: ''
};

/** App Store Connect locales */
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

/**
 * Keyword character limits by locale
 *
 * Most locales have 100 chars, but some vary.
 *
 * @type {Object.<string, number>}
 */
const KEYWORD_LIMITS = {
  'ja-JP': 100,
  'ko-KR': 100,
  'cmn-Hans': 100,
  'cmn-Hant': 100,
  default: 100
};

/**
 * Get the keyword character limit for a given locale
 *
 * @param {string} locale - Locale code
 * @returns {number} Maximum keyword characters
 */
function getKeywordLimit(locale) {
  return KEYWORD_LIMITS[locale] || KEYWORD_LIMITS.default;
}

/**
 * Character count indicator with color feedback
 *
 * @component
 * @param {Object} props
 * @param {number} props.current - Current character count
 * @param {number} props.max - Maximum allowed characters
 * @returns {JSX.Element} Styled character count display
 */
function CharCount({ current, max }) {
  const isNearLimit = current > max * 0.9;
  const isOverLimit = current > max;

  return (
    <span
      className={`text-xs ${isOverLimit ? 'text-red-500' : isNearLimit ? 'text-yellow-500' : 'text-muted-foreground'}`}
      aria-live="polite"
    >
      {current}/{max}
    </span>
  );
}

/**
 * Inline diff display comparing original and current text
 *
 * @component
 * @param {Object} props
 * @param {string} props.original - Original text
 * @param {string} props.current - Current (modified) text
 * @param {string} props.label - Field label
 * @returns {JSX.Element|null} Diff display or null if unchanged
 */
function DiffField({ original, current, label }) {
  if (original === current) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {original && (
        <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 line-through dark:bg-red-950/30 dark:text-red-400">
          {original}
        </p>
      )}
      {current && (
        <p className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-400">
          {current}
        </p>
      )}
    </div>
  );
}

export default function MetadataView() {
  const { selectedApp } = useApp();

  // Locale state
  const [selectedLocale, setSelectedLocale] = useState('en-US');
  const [localizedMetadata, setLocalizedMetadata] = useState({});
  const [originalMetadata, setOriginalMetadata] = useState({});
  const [localizationIds, setLocalizationIds] = useState({});
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // AI generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [keyFeatures, setKeyFeatures] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [tone, setTone] = useState('Professional');
  const [generatingField, setGeneratingField] = useState(null);
  const [improvingField, setImprovingField] = useState(null);

  // Translation state
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);

  // Keyword suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Diff dialog state
  const [showDiffDialog, setShowDiffDialog] = useState(false);

  // Version history state
  const [showHistory, setShowHistory] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  /** Current locale's metadata (convenience accessor) */
  const metadata = localizedMetadata[selectedLocale] || EMPTY_METADATA;

  /** Whether any changes exist for the current locale */
  const hasChanges = JSON.stringify(metadata) !== JSON.stringify(originalMetadata[selectedLocale] || EMPTY_METADATA);

  /** Fetch metadata when the selected app changes */
  useEffect(() => {
    if (selectedApp?.id) {
      fetchMetadata(selectedApp.id);
    } else {
      setLocalizedMetadata({});
      setOriginalMetadata({});
      setLocalizationIds({});
    }
  }, [selectedApp?.id]);

  /**
   * Fetch all localized metadata for the selected app
   *
   * Walks the appInfo → localizations chain and builds a locale-keyed map
   * of metadata fields plus localization IDs for PATCH requests.
   *
   * @param {string} appId - App Store Connect app identifier
   */
  async function fetchMetadata(appId) {
    if (!appId || appId.startsWith('local-')) return;
    setIsLoadingMeta(true);
    try {
      const result = await apiRequest(`/asc/apps/${appId}/metadata`);
      if (result?.data) {
        const metaMap = {};
        const origMap = {};
        const idMap = {};

        for (const info of result.data) {
          const localizations = info.localizations || [];
          for (const loc of localizations) {
            const locale = loc.attributes?.locale || 'en-US';
            const fields = {
              name: loc.attributes?.name || '',
              subtitle: loc.attributes?.subtitle || '',
              description: loc.attributes?.description || '',
              keywords: loc.attributes?.keywords || '',
              whatsNew: loc.attributes?.whatsNew || '',
              supportUrl: loc.attributes?.supportUrl || '',
              marketingUrl: loc.attributes?.marketingUrl || ''
            };
            metaMap[locale] = { ...fields };
            origMap[locale] = { ...fields };
            idMap[locale] = loc.id;
          }
        }

        // Ensure en-US exists
        if (!metaMap['en-US']) {
          metaMap['en-US'] = { ...EMPTY_METADATA };
          origMap['en-US'] = { ...EMPTY_METADATA };
        }

        setLocalizedMetadata(metaMap);
        setOriginalMetadata(origMap);
        setLocalizationIds(idMap);
      }
    } catch {
      setLocalizedMetadata({ 'en-US': { ...EMPTY_METADATA } });
      setOriginalMetadata({ 'en-US': { ...EMPTY_METADATA } });
    } finally {
      setIsLoadingMeta(false);
    }
  }

  /**
   * Update a single metadata field for the current locale
   *
   * @param {string} field - Field name in metadata state
   * @param {string} value - New field value
   */
  function handleFieldChange(field, value) {
    setLocalizedMetadata((prev) => ({
      ...prev,
      [selectedLocale]: { ...(prev[selectedLocale] || EMPTY_METADATA), [field]: value }
    }));
  }

  /**
   * Initiate save — shows diff dialog if changes exist, otherwise saves directly
   */
  function handleInitiateSave() {
    if (hasChanges) {
      setShowDiffDialog(true);
    } else {
      handleSaveMetadata();
    }
  }

  /**
   * Save metadata changes to App Store Connect for the current locale
   *
   * Also auto-saves a snapshot to version history.
   */
  async function handleSaveMetadata() {
    if (!selectedApp?.id) return;
    setIsSaving(true);
    setShowDiffDialog(false);
    try {
      const localizationId = localizationIds[selectedLocale];
      if (localizationId) {
        await apiRequest(`/asc/apps/${selectedApp.id}/metadata`, {
          method: 'PATCH',
          body: JSON.stringify({ localizationId, attributes: metadata })
        });
      }

      // Save to version history
      try {
        await apiRequest('/metadata-history', {
          method: 'POST',
          body: JSON.stringify({
            appId: selectedApp.id,
            locale: selectedLocale,
            metadata
          })
        });
      } catch {
        // History save failure shouldn't block the main save
      }

      // Update original to match current
      setOriginalMetadata((prev) => ({
        ...prev,
        [selectedLocale]: { ...metadata }
      }));

      toast.success('Metadata saved successfully');
    } catch {
      toast.error('Failed to save metadata');
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Generate all metadata fields using AI
   *
   * Calls POST /ai/generate-metadata with app context and populates
   * all metadata form fields from the response.
   */
  async function handleGenerateAll() {
    if (!metadata.name && !selectedApp?.name) {
      toast.error('Enter an app name first');
      return;
    }
    setIsGenerating(true);
    try {
      const result = await apiRequest('/ai/generate-metadata', {
        method: 'POST',
        body: JSON.stringify({
          appName: metadata.name || selectedApp?.name || '',
          keyFeatures,
          targetAudience,
          tone
        })
      });
      if (result?.data) {
        setLocalizedMetadata((prev) => ({
          ...prev,
          [selectedLocale]: {
            ...(prev[selectedLocale] || EMPTY_METADATA),
            name: result.data.name || metadata.name,
            subtitle: result.data.subtitle || metadata.subtitle,
            description: result.data.description || metadata.description,
            keywords: result.data.keywords || metadata.keywords,
            whatsNew: result.data.whatsNew || metadata.whatsNew
          }
        }));
        toast.success('Metadata generated successfully');
      }
    } catch {
      toast.error('Failed to generate metadata');
    } finally {
      setIsGenerating(false);
    }
  }

  /**
   * Generate a single metadata field using AI
   *
   * @param {'description' | 'keywords' | 'whatsNew'} field - Field to generate
   */
  async function handleGenerateField(field) {
    const appName = metadata.name || selectedApp?.name || '';
    if (!appName) {
      toast.error('Enter an app name first');
      return;
    }
    setGeneratingField(field);
    try {
      const endpoints = {
        description: '/ai/generate-description',
        keywords: '/ai/generate-keywords',
        whatsNew: '/ai/generate-whats-new'
      };
      const bodies = {
        description: { appName, context: metadata.description || keyFeatures },
        keywords: { appName, description: metadata.description, currentKeywords: metadata.keywords },
        whatsNew: { appName, changes: metadata.whatsNew }
      };
      const result = await apiRequest(endpoints[field], {
        method: 'POST',
        body: JSON.stringify(bodies[field])
      });
      if (result?.data?.[field]) {
        handleFieldChange(field, result.data[field]);
        toast.success(`${field === 'whatsNew' ? "What's New" : field.charAt(0).toUpperCase() + field.slice(1)} generated`);
      }
    } catch {
      toast.error(`Failed to generate ${field}`);
    } finally {
      setGeneratingField(null);
    }
  }

  /**
   * Improve text in a metadata field using AI
   *
   * @param {'description' | 'whatsNew'} field - Field to improve
   */
  async function handleImproveField(field) {
    const text = metadata[field];
    if (!text.trim()) {
      toast.error('Enter some text to improve first');
      return;
    }
    setImprovingField(field);
    try {
      const result = await apiRequest('/ai/improve-text', {
        method: 'POST',
        body: JSON.stringify({
          text,
          field,
          appName: metadata.name || selectedApp?.name || ''
        })
      });
      if (result?.data?.text) {
        handleFieldChange(field, result.data.text);
        toast.success('Text improved');
      }
    } catch {
      toast.error('Failed to improve text');
    } finally {
      setImprovingField(null);
    }
  }

  /**
   * Translate a specific field to all locales via batch translation
   *
   * @param {string} field - Metadata field to translate
   */
  async function handleTranslateField(field) {
    const sourceText = metadata[field];
    if (!sourceText?.trim()) {
      toast.error('Enter text first');
      return;
    }

    setIsTranslating(true);
    setTranslationProgress(0);

    const englishLocales = new Set(['en-US', 'en-GB', 'en-AU', 'en-CA']);
    const nonEnglish = LOCALES.filter((l) => !englishLocales.has(l.code));
    let completed = 0;

    // Copy to English locales
    for (const code of englishLocales) {
      setLocalizedMetadata((prev) => ({
        ...prev,
        [code]: { ...(prev[code] || EMPTY_METADATA), [field]: sourceText }
      }));
    }
    setTranslationProgress(Math.round((englishLocales.size / LOCALES.length) * 100));

    // Translate to each non-English locale
    for (const locale of nonEnglish) {
      try {
        const response = await apiRequest('/translate/batch', {
          method: 'POST',
          body: JSON.stringify({
            texts: [sourceText],
            source: 'en',
            target: locale.code
          })
        });

        if (response?.translations?.[0]) {
          setLocalizedMetadata((prev) => ({
            ...prev,
            [locale.code]: {
              ...(prev[locale.code] || EMPTY_METADATA),
              [field]: response.translations[0]
            }
          }));
        }
      } catch {
        // Skip failed translations
      }

      completed++;
      setTranslationProgress(Math.round(((englishLocales.size + completed) / LOCALES.length) * 100));
    }

    setIsTranslating(false);
    setTranslationProgress(100);
    toast.success(`${field} translated to all locales`);
  }

  /**
   * Fetch ASO keyword suggestions from AI
   */
  async function handleSuggestKeywords() {
    const appName = metadata.name || selectedApp?.name || '';
    if (!appName) {
      toast.error('Enter an app name first');
      return;
    }
    setIsLoadingSuggestions(true);
    try {
      const result = await apiRequest('/ai/suggest-keywords', {
        method: 'POST',
        body: JSON.stringify({
          appName,
          description: metadata.description,
          locale: selectedLocale,
          currentKeywords: metadata.keywords
        })
      });
      if (result?.suggestions) {
        setSuggestions(result.suggestions);
      }
    } catch {
      toast.error('Failed to get keyword suggestions');
    } finally {
      setIsLoadingSuggestions(false);
    }
  }

  /**
   * Add a suggested keyword to the current keywords field
   *
   * @param {string} keyword - Keyword to add
   */
  function handleAddSuggestion(keyword) {
    const current = metadata.keywords;
    const limit = getKeywordLimit(selectedLocale);
    const separator = current ? ',' : '';
    const newKeywords = `${current}${separator}${keyword}`;
    if (newKeywords.length <= limit) {
      handleFieldChange('keywords', newKeywords);
      setSuggestions((prev) => prev.filter((s) => s.keyword !== keyword));
    } else {
      toast.error('Adding this keyword would exceed the character limit');
    }
  }

  /**
   * Fetch version history snapshots for the current app
   */
  async function handleFetchHistory() {
    if (!selectedApp?.id) return;
    setIsLoadingHistory(true);
    try {
      const result = await apiRequest(`/metadata-history/${selectedApp.id}`);
      setHistorySnapshots(result?.data || []);
    } catch {
      toast.error('Failed to load version history');
    } finally {
      setIsLoadingHistory(false);
    }
  }

  /**
   * Restore metadata from a history snapshot
   *
   * @param {string} snapshotId - Snapshot identifier to restore
   */
  async function handleRestoreSnapshot(snapshotId) {
    try {
      const result = await apiRequest(`/metadata-history/snapshot/${snapshotId}`);
      if (result?.data) {
        const restored = typeof result.data.metadata === 'string'
          ? JSON.parse(result.data.metadata)
          : result.data.metadata;
        const locale = result.data.locale || selectedLocale;

        setLocalizedMetadata((prev) => ({
          ...prev,
          [locale]: { ...(prev[locale] || EMPTY_METADATA), ...restored }
        }));
        setSelectedLocale(locale);
        setShowHistory(false);
        toast.success('Snapshot restored');
      }
    } catch {
      toast.error('Failed to restore snapshot');
    }
  }

  /** Get diff fields for the diff dialog */
  const diffFields = [
    { key: 'name', label: 'App Name' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'description', label: 'Description' },
    { key: 'keywords', label: 'Keywords' },
    { key: 'whatsNew', label: "What's New" },
    { key: 'supportUrl', label: 'Support URL' },
    { key: 'marketingUrl', label: 'Marketing URL' }
  ];

  const original = originalMetadata[selectedLocale] || EMPTY_METADATA;
  const keywordLimit = getKeywordLimit(selectedLocale);

  return (
    <>
      <Header title="" className="[&>div>div:last-child]:ml-0 [&>div>div:last-child]:flex-1">
        <AppPicker />
        <div className="flex-1" />
        {selectedApp && (
          <>
            <Select value={selectedLocale} onValueChange={setSelectedLocale}>
              <SelectTrigger className="h-8 w-48" aria-label="Select locale for metadata editing">
                <SelectValue>{LOCALES.find((l) => l.code === selectedLocale)?.name || 'Select Locale'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((locale) => (
                  <SelectItem key={locale.code} value={locale.code}>
                    {locale.name}
                    {localizedMetadata[locale.code] ? '' : ' (empty)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasChanges && (
              <Badge variant="outline" className="text-yellow-600">Unsaved</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleFetchHistory();
                setShowHistory(true);
              }}
              aria-label="View metadata version history"
            >
              History
            </Button>
          </>
        )}
      </Header>
      {!selectedApp ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Select an app to get started</p>
        </div>
      ) : (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-6 p-4 md:p-6">

          {/* AI Generation Card */}
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Generate with AI</CardTitle>
              <CardDescription>
                Provide context to generate optimized App Store metadata using Grok
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai-key-features">Key Features</Label>
                  <Input
                    id="ai-key-features"
                    value={keyFeatures}
                    onChange={(e) => setKeyFeatures(e.target.value)}
                    placeholder="workout tracking, meal logging, progress photos"
                    aria-label="Key features for AI generation"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai-target-audience">Target Audience</Label>
                  <Input
                    id="ai-target-audience"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="fitness enthusiasts"
                    aria-label="Target audience for AI generation"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai-tone">Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger id="ai-tone" aria-label="Select tone for AI generation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleGenerateAll}
                  disabled={isGenerating}
                  aria-label="Generate all metadata fields with AI"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="h-4 w-4" />
                      Generating...
                    </span>
                  ) : (
                    'Generate All Metadata'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Translation Progress */}
          {isTranslating && (
            <Card>
              <CardContent className="flex flex-col gap-2 p-4" role="status" aria-live="polite">
                <p className="text-sm font-medium">Translating to all locales...</p>
                <Progress value={translationProgress} aria-label="Translation progress" />
                <p className="text-xs text-muted-foreground">{translationProgress}% complete</p>
              </CardContent>
            </Card>
          )}

          {/* Metadata Form */}
          {isLoadingMeta ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground" role="status">Loading metadata...</p>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-5 p-4 md:p-6">
                {/* App Name */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="meta-name">App Name</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={isTranslating}
                        onClick={() => handleTranslateField('name')}
                        aria-label="Translate app name to all locales"
                      >
                        Translate All
                      </Button>
                    </div>
                    <CharCount current={metadata.name.length} max={30} />
                  </div>
                  <Input
                    id="meta-name"
                    value={metadata.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    maxLength={30}
                    placeholder="My App"
                    aria-label="App name, maximum 30 characters"
                  />
                </div>

                {/* Subtitle */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="meta-subtitle">Subtitle</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={isTranslating}
                        onClick={() => handleTranslateField('subtitle')}
                        aria-label="Translate subtitle to all locales"
                      >
                        Translate All
                      </Button>
                    </div>
                    <CharCount current={metadata.subtitle.length} max={30} />
                  </div>
                  <Input
                    id="meta-subtitle"
                    value={metadata.subtitle}
                    onChange={(e) => handleFieldChange('subtitle', e.target.value)}
                    maxLength={30}
                    placeholder="A brief subtitle"
                    aria-label="App subtitle, maximum 30 characters"
                  />
                </div>

                <Separator />

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="meta-description">Description</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={generatingField === 'description'}
                        onClick={() => handleGenerateField('description')}
                        aria-label="Generate description with AI"
                      >
                        {generatingField === 'description' ? <Spinner className="h-3 w-3" /> : 'AI'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={improvingField === 'description' || !metadata.description.trim()}
                        onClick={() => handleImproveField('description')}
                        aria-label="Improve description with AI"
                      >
                        {improvingField === 'description' ? <Spinner className="h-3 w-3" /> : 'Improve'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={isTranslating}
                        onClick={() => handleTranslateField('description')}
                        aria-label="Translate description to all locales"
                      >
                        Translate All
                      </Button>
                    </div>
                    <CharCount current={metadata.description.length} max={4000} />
                  </div>
                  <Textarea
                    id="meta-description"
                    value={metadata.description}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    maxLength={4000}
                    rows={6}
                    placeholder="Describe your app..."
                    aria-label="App description, maximum 4000 characters"
                  />
                </div>

                {/* Keywords */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="meta-keywords">Keywords</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={generatingField === 'keywords'}
                        onClick={() => handleGenerateField('keywords')}
                        aria-label="Generate keywords with AI"
                      >
                        {generatingField === 'keywords' ? <Spinner className="h-3 w-3" /> : 'AI'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={isLoadingSuggestions}
                        onClick={handleSuggestKeywords}
                        aria-label="Get ASO keyword suggestions"
                      >
                        {isLoadingSuggestions ? <Spinner className="h-3 w-3" /> : 'Suggest'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={isTranslating}
                        onClick={() => handleTranslateField('keywords')}
                        aria-label="Translate keywords to all locales"
                      >
                        Translate All
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <CharCount current={metadata.keywords.length} max={keywordLimit} />
                      {metadata.keywords.length > keywordLimit && (
                        <Badge variant="destructive" className="text-[10px]">Over limit</Badge>
                      )}
                    </div>
                  </div>
                  <Input
                    id="meta-keywords"
                    value={metadata.keywords}
                    onChange={(e) => handleFieldChange('keywords', e.target.value)}
                    maxLength={keywordLimit}
                    placeholder="keyword1,keyword2,keyword3"
                    aria-label={`Keywords, comma-separated, maximum ${keywordLimit} characters`}
                  />
                  <p className="text-xs text-muted-foreground">Separate keywords with commas</p>

                  {/* Keyword Suggestions */}
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {suggestions.map((s) => (
                        <Badge
                          key={s.keyword}
                          variant={s.volume === 'high' ? 'default' : s.volume === 'med' ? 'secondary' : 'outline'}
                          className="cursor-pointer text-xs hover:opacity-80"
                          onClick={() => handleAddSuggestion(s.keyword)}
                          role="button"
                          tabIndex={0}
                          aria-label={`Add keyword "${s.keyword}" (${s.volume} volume)`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleAddSuggestion(s.keyword);
                            }
                          }}
                        >
                          {s.keyword}
                          <span className="ml-1 opacity-60">{s.volume}</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* What's New */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="meta-whats-new">What's New</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={generatingField === 'whatsNew'}
                        onClick={() => handleGenerateField('whatsNew')}
                        aria-label="Generate what's new with AI"
                      >
                        {generatingField === 'whatsNew' ? <Spinner className="h-3 w-3" /> : 'AI'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={improvingField === 'whatsNew' || !metadata.whatsNew.trim()}
                        onClick={() => handleImproveField('whatsNew')}
                        aria-label="Improve what's new text with AI"
                      >
                        {improvingField === 'whatsNew' ? <Spinner className="h-3 w-3" /> : 'Improve'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={isTranslating}
                        onClick={() => handleTranslateField('whatsNew')}
                        aria-label="Translate what's new to all locales"
                      >
                        Translate All
                      </Button>
                    </div>
                    <CharCount current={metadata.whatsNew.length} max={4000} />
                  </div>
                  <Textarea
                    id="meta-whats-new"
                    value={metadata.whatsNew}
                    onChange={(e) => handleFieldChange('whatsNew', e.target.value)}
                    maxLength={4000}
                    rows={4}
                    placeholder="Describe what's new in this version..."
                    aria-label="What's new release notes, maximum 4000 characters"
                  />
                </div>

                <Separator />

                {/* Support URL */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="meta-support-url">Support URL</Label>
                  <Input
                    id="meta-support-url"
                    type="url"
                    value={metadata.supportUrl}
                    onChange={(e) => handleFieldChange('supportUrl', e.target.value)}
                    placeholder="https://example.com/support"
                    aria-label="Support URL"
                  />
                </div>

                {/* Marketing URL */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="meta-marketing-url">Marketing URL</Label>
                  <Input
                    id="meta-marketing-url"
                    type="url"
                    value={metadata.marketingUrl}
                    onChange={(e) => handleFieldChange('marketingUrl', e.target.value)}
                    placeholder="https://example.com"
                    aria-label="Marketing URL"
                  />
                </div>

                <Separator />

                <div className="flex justify-end gap-3">
                  <Button
                    onClick={handleInitiateSave}
                    disabled={isSaving || !selectedApp?.id}
                    aria-label="Save metadata changes to App Store Connect"
                  >
                    {isSaving ? 'Saving...' : 'Save to App Store Connect'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
      )}

      {/* Diff Dialog */}
      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Review Changes — {LOCALES.find((l) => l.code === selectedLocale)?.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            <div className="flex flex-col gap-3 pr-4">
              {diffFields.map(({ key, label }) => (
                <DiffField
                  key={key}
                  original={original[key]}
                  current={metadata[key]}
                  label={label}
                />
              ))}
              {!diffFields.some(({ key }) => original[key] !== metadata[key]) && (
                <p className="text-sm text-muted-foreground">No changes detected</p>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiffDialog(false)} aria-label="Cancel save">
              Cancel
            </Button>
            <Button onClick={handleSaveMetadata} disabled={isSaving} aria-label="Confirm and save changes">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Sheet */}
      <Sheet open={showHistory} onOpenChange={setShowHistory}>
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Version History</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-6">
            {isLoadingHistory ? (
              <p className="text-sm text-muted-foreground" role="status">Loading history...</p>
            ) : historySnapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved versions yet</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-120px)]">
                <div className="flex flex-col gap-2 pr-4">
                  {historySnapshots.map((snapshot) => (
                    <Card key={snapshot.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-xs font-medium">
                            {LOCALES.find((l) => l.code === snapshot.locale)?.name || snapshot.locale}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(snapshot.saved_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleRestoreSnapshot(snapshot.id)}
                          aria-label={`Restore version from ${new Date(snapshot.saved_at).toLocaleString()}`}
                        >
                          Restore
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
