/**
 * Metadata editing view for App Store Connect app listings
 *
 * Provides a form to edit localized metadata fields (name, subtitle, description,
 * keywords, what's new, URLs) and save changes back to App Store Connect.
 *
 * @component
 * @returns {JSX.Element} Metadata editing form
 */
import { useState, useEffect, useCallback } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest, useListData } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Textarea } from '@stevederico/skateboard-ui/shadcn/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { Empty } from '@stevederico/skateboard-ui/shadcn/ui/empty';
import { toast } from 'sonner';

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
  const [selectedApp, setSelectedApp] = useState('');
  const [metadata, setMetadata] = useState(EMPTY_METADATA);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: apps, isLoading: isLoadingApps } = useListData('/asc/apps');

  /**
   * Fetch metadata for the selected app
   *
   * @param {string} appId - App Store Connect app identifier
   */
  const fetchMetadata = useCallback(async (appId) => {
    if (!appId) return;
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
      toast.error('Failed to load metadata');
      setMetadata(EMPTY_METADATA);
    } finally {
      setIsLoadingMeta(false);
    }
  }, []);

  /**
   * Handle app selection change
   *
   * @param {string} appId - Selected app identifier
   */
  function handleAppChange(appId) {
    setSelectedApp(appId);
    fetchMetadata(appId);
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
  async function handleSave() {
    if (!selectedApp) return;
    setIsSaving(true);
    try {
      await apiRequest(`/asc/apps/${selectedApp}/metadata`, {
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

  return (
    <>
      <Header title="Metadata" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4 md:p-6">
          {/* App selector */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta-app-select">App</Label>
            <Select value={selectedApp} onValueChange={handleAppChange}>
              <SelectTrigger id="meta-app-select" className="w-64" aria-label="Select an app">
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

          {!selectedApp && (
            <Empty
              title="Select an App"
              description="Choose an app from the dropdown above to edit its metadata."
            />
          )}

          {selectedApp && isLoadingMeta && (
            <div className="flex items-center justify-center py-20">
              <Spinner aria-label="Loading metadata" />
            </div>
          )}

          {selectedApp && !isLoadingMeta && (
            <Card>
              <CardHeader>
                <CardTitle>App Store Listing</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
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
                    <Label htmlFor="meta-description">Description</Label>
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
                    <Label htmlFor="meta-keywords">Keywords</Label>
                    <CharCount current={metadata.keywords.length} max={100} />
                  </div>
                  <Input
                    id="meta-keywords"
                    value={metadata.keywords}
                    onChange={(e) => handleFieldChange('keywords', e.target.value)}
                    maxLength={100}
                    placeholder="keyword1, keyword2, keyword3"
                    aria-label="Keywords, comma-separated, maximum 100 characters"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separate keywords with commas
                  </p>
                </div>

                <Separator />

                {/* What's New */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="meta-whats-new">What's New</Label>
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
                    onClick={handleSave}
                    disabled={isSaving}
                    aria-label="Save metadata changes to App Store Connect"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
