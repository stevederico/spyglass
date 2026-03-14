/**
 * Metadata editing view with AI-powered generation via x.ai Grok
 *
 * Provides an editable form for App Store Connect localized listings
 * with character counts, per-field AI generation, bulk generation,
 * and text improvement capabilities.
 *
 * @component
 * @returns {JSX.Element} Metadata management interface
 */
import { useState, useEffect, useCallback } from 'react';
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

export default function MetadataView() {
  const { selectedApp } = useApp();

  const [metadata, setMetadata] = useState(EMPTY_METADATA);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [keyFeatures, setKeyFeatures] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [tone, setTone] = useState('Professional');
  const [generatingField, setGeneratingField] = useState(null);
  const [improvingField, setImprovingField] = useState(null);

  /** Fetch metadata when the selected app changes */
  useEffect(() => {
    if (selectedApp?.id) {
      fetchMetadata(selectedApp.id);
    } else {
      setMetadata(EMPTY_METADATA);
    }
  }, [selectedApp?.id]);

  /**
   * Fetch metadata for the selected app
   *
   * @param {string} appId - App Store Connect app identifier
   */
  async function fetchMetadata(appId) {
    if (!appId || appId.startsWith('local-')) return;
    setIsLoadingMeta(true);
    try {
      const result = await apiRequest(`/asc/apps/${appId}/metadata`);
      if (result?.data) {
        const attrs = result.data.attributes || {};
        setMetadata({
          name: attrs.name || '',
          subtitle: attrs.subtitle || '',
          description: attrs.description || '',
          keywords: attrs.keywords || '',
          whatsNew: attrs.whatsNew || '',
          supportUrl: attrs.supportUrl || '',
          marketingUrl: attrs.marketingUrl || ''
        });
      }
    } catch {
      setMetadata(EMPTY_METADATA);
    } finally {
      setIsLoadingMeta(false);
    }
  }

  /**
   * Update a single metadata field
   *
   * @param {string} field - Field name in metadata state
   * @param {string} value - New field value
   */
  function handleFieldChange(field, value) {
    setMetadata((prev) => ({ ...prev, [field]: value }));
  }

  /** Save metadata changes to App Store Connect */
  async function handleSaveMetadata() {
    if (!selectedApp?.id) return;
    setIsSaving(true);
    try {
      await apiRequest(`/asc/apps/${selectedApp.id}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify(metadata)
      });
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
        setMetadata((prev) => ({
          ...prev,
          name: result.data.name || prev.name,
          subtitle: result.data.subtitle || prev.subtitle,
          description: result.data.description || prev.description,
          keywords: result.data.keywords || prev.keywords,
          whatsNew: result.data.whatsNew || prev.whatsNew
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
                    <Label htmlFor="meta-name">App Name</Label>
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
                    <Label htmlFor="meta-subtitle">Subtitle</Label>
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
                    </div>
                    <CharCount current={metadata.keywords.length} max={100} />
                  </div>
                  <Input
                    id="meta-keywords"
                    value={metadata.keywords}
                    onChange={(e) => handleFieldChange('keywords', e.target.value)}
                    maxLength={100}
                    placeholder="keyword1,keyword2,keyword3"
                    aria-label="Keywords, comma-separated, maximum 100 characters"
                  />
                  <p className="text-xs text-muted-foreground">Separate keywords with commas</p>
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

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveMetadata}
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
    </>
  );
}
