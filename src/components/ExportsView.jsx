/**
 * Unified exports view combining screenshots and metadata management
 *
 * Provides filtering by app, language, and device type. Displays a responsive
 * grid of screenshot thumbnails with upload/delete capabilities, and an
 * editable metadata form for App Store Connect localized listings.
 *
 * @component
 * @returns {JSX.Element} Combined screenshots and metadata management interface
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
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { AspectRatio } from '@stevederico/skateboard-ui/shadcn/ui/aspect-ratio';
import { Alert, AlertDescription } from '@stevederico/skateboard-ui/shadcn/ui/alert';
import { toast } from 'sonner';

/** App Store Connect locale options */
const LOCALES = [
  { code: 'all', name: 'All Languages' },
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

/** Device display type options for App Store Connect screenshots */
const DEVICE_TYPES = [
  { code: 'all', name: 'All Devices' },
  { code: 'APP_IPHONE_69', name: 'iPhone 16 Pro Max (6.9")' },
  { code: 'APP_IPHONE_67', name: 'iPhone 16 Plus (6.7")' },
  { code: 'APP_IPHONE_65', name: 'iPhone 16 Pro (6.3")' },
  { code: 'APP_IPHONE_61', name: 'iPhone 16 (6.1")' },
  { code: 'APP_IPHONE_55', name: 'iPhone 8 Plus (5.5")' },
  { code: 'APP_IPHONE_47', name: 'iPhone SE (4.7")' },
  { code: 'APP_IPAD_PRO_13', name: 'iPad Pro 13" (M4)' },
  { code: 'APP_IPAD_PRO_129', name: 'iPad Pro 12.9"' },
  { code: 'APP_IPAD_AIR_11', name: 'iPad Air 11"' },
  { code: 'APP_IPAD_105', name: 'iPad 10.5"' }
];

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
 * Determine if a device code represents an iPad
 *
 * @param {string} code - Device type code
 * @returns {boolean} True if the device is an iPad
 */
function isIPad(code) {
  return code.startsWith('APP_IPAD');
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
 * Screenshot thumbnail card with image preview, badges, and delete action
 *
 * @component
 * @param {Object} props
 * @param {Object} props.screenshot - Screenshot data with id, url, locale, deviceType, filename
 * @param {Function} props.onDelete - Callback when delete is requested
 * @returns {JSX.Element} Screenshot card
 */
function ScreenshotCard({ screenshot, onDelete }) {
  const deviceIsIPad = isIPad(screenshot.deviceType || '');
  const aspectRatio = deviceIsIPad ? 3 / 4 : 9 / 16;
  const localeName = LOCALES.find((l) => l.code === screenshot.locale)?.name || screenshot.locale;
  const deviceName = DEVICE_TYPES.find((d) => d.code === screenshot.deviceType)?.name || screenshot.deviceType;

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-0">
        <AspectRatio ratio={aspectRatio}>
          {screenshot.url ? (
            <img
              src={screenshot.url}
              alt={`Screenshot ${screenshot.filename || screenshot.id}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
              No preview
            </div>
          )}
        </AspectRatio>
        <div className="flex flex-col gap-1.5 p-2">
          <p className="truncate text-xs font-medium" title={screenshot.filename}>
            {screenshot.filename || `Screenshot ${screenshot.id}`}
          </p>
          <div className="flex flex-wrap gap-1">
            {screenshot.locale && (
              <Badge variant="secondary" className="text-[10px]">
                {localeName}
              </Badge>
            )}
            {screenshot.deviceType && (
              <Badge variant="outline" className="text-[10px]">
                {deviceName}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 w-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(screenshot.id)}
            aria-label={`Delete screenshot ${screenshot.filename || screenshot.id}`}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Drop zone for uploading new screenshots via drag-and-drop or file picker
 *
 * @component
 * @param {Object} props
 * @param {Function} props.onUpload - Callback receiving the selected File object
 * @param {boolean} props.isUploading - Whether an upload is in progress
 * @returns {JSX.Element} Upload drop zone card
 */
function UploadDropZone({ onUpload, isUploading }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  /**
   * Handle file drop event
   *
   * @param {DragEvent} e - Drop event
   */
  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onUpload(file);
    }
  }

  /**
   * Handle file selection from input
   *
   * @param {Event} e - File input change event
   */
  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  }

  return (
    <Card
      className={`flex min-h-48 cursor-pointer items-center justify-center border-2 border-dashed transition-colors ${
        isDragOver
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Upload screenshot, click or drag and drop an image"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
    >
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <div className="text-3xl text-muted-foreground">+</div>
        <p className="text-sm font-medium text-muted-foreground">
          {isUploading ? 'Uploading...' : 'Upload Screenshot'}
        </p>
        <p className="text-xs text-muted-foreground">
          Drag and drop or click to browse
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />
    </Card>
  );
}

export default function ExportsView() {
  const [apps, setApps] = useState([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [selectedApp, setSelectedApp] = useState('');
  const [appNameInput, setAppNameInput] = useState('');
  const [selectedLocale, setSelectedLocale] = useState('all');
  const [selectedDevice, setSelectedDevice] = useState('all');

  const [screenshots, setScreenshots] = useState([]);
  const [isLoadingScreenshots, setIsLoadingScreenshots] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [metadata, setMetadata] = useState(EMPTY_METADATA);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /** Fetch the list of apps from App Store Connect on mount */
  useEffect(() => {
    fetchApps();
  }, []);

  /** Fetch apps, set connected state based on response */
  async function fetchApps() {
    setIsLoadingApps(true);
    try {
      const result = await apiRequest('/asc/apps');
      if (result?.data) {
        setApps(result.data);
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    } catch {
      setIsConnected(false);
    } finally {
      setIsLoadingApps(false);
    }
  }

  /**
   * Fetch screenshots for the selected app
   *
   * @param {string} appId - App Store Connect app identifier
   */
  async function fetchScreenshots(appId) {
    if (!appId) return;
    setIsLoadingScreenshots(true);
    try {
      const result = await apiRequest(`/asc/apps/${appId}/screenshots`);
      setScreenshots(result?.data || []);
    } catch {
      toast.error('Failed to load screenshots');
      setScreenshots([]);
    } finally {
      setIsLoadingScreenshots(false);
    }
  }

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
   * Handle app selection change and fetch its data
   *
   * @param {string} appId - Selected app identifier
   */
  function handleAppChange(appId) {
    setSelectedApp(appId);
    fetchScreenshots(appId);
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
  async function handleSaveMetadata() {
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

  /**
   * Upload a screenshot file for the selected app
   *
   * @param {File} file - Image file to upload
   */
  async function handleUploadScreenshot(file) {
    if (!selectedApp) {
      toast.error('Select an app first');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedLocale !== 'all') formData.append('locale', selectedLocale);
      if (selectedDevice !== 'all') formData.append('deviceType', selectedDevice);

      await apiRequest(`/asc/apps/${selectedApp}/screenshots`, {
        method: 'POST',
        body: formData
      });
      toast.success('Screenshot uploaded');
      await fetchScreenshots(selectedApp);
    } catch {
      toast.error('Failed to upload screenshot');
    } finally {
      setIsUploading(false);
    }
  }

  /**
   * Delete a screenshot by its identifier
   *
   * @param {string} screenshotId - Screenshot identifier to delete
   */
  async function handleDeleteScreenshot(screenshotId) {
    try {
      await apiRequest(`/asc/screenshots/${screenshotId}`, {
        method: 'DELETE'
      });
      toast.success('Screenshot deleted');
      setScreenshots((prev) => prev.filter((s) => s.id !== screenshotId));
    } catch {
      toast.error('Failed to delete screenshot');
    }
  }

  /** Filter screenshots by the currently selected locale and device type */
  const filteredScreenshots = screenshots.filter((s) => {
    const localeMatch = selectedLocale === 'all' || s.locale === selectedLocale;
    const deviceMatch = selectedDevice === 'all' || s.deviceType === selectedDevice;
    return localeMatch && deviceMatch;
  });

  return (
    <>
      <Header title="Exports" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-6 p-4 md:p-6">

          {/* ASC not connected info banner */}
          {!isConnected && (
            <Alert>
              <AlertDescription>
                Connect to App Store Connect in{' '}
                <a href="/settings" className="font-medium text-blue-500 underline" aria-label="Go to Settings to connect App Store Connect">
                  Settings
                </a>{' '}
                to manage screenshots and metadata directly. The page is still usable for viewing local exports.
              </AlertDescription>
            </Alert>
          )}

          {/* Filter Bar */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:flex-wrap">
              {/* App selector */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="export-app-select">App</Label>
                {isConnected ? (
                  <Select value={selectedApp} onValueChange={handleAppChange}>
                    <SelectTrigger id="export-app-select" className="w-56" aria-label="Select an app">
                      <SelectValue placeholder="Select an app" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingApps ? (
                        <SelectItem value="_loading" disabled>Loading...</SelectItem>
                      ) : (
                        apps.map((app) => (
                          <SelectItem key={app.id} value={app.id}>
                            {app.attributes?.name || app.id}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="export-app-select"
                    value={appNameInput}
                    onChange={(e) => setAppNameInput(e.target.value)}
                    placeholder="Enter app name"
                    className="w-56"
                    aria-label="Enter app name manually"
                  />
                )}
              </div>

              {/* Language filter */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="export-locale-select">Language</Label>
                <Select value={selectedLocale} onValueChange={setSelectedLocale}>
                  <SelectTrigger id="export-locale-select" className="w-56" aria-label="Filter by language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((locale) => (
                      <SelectItem key={locale.code} value={locale.code}>
                        {locale.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Device type filter */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="export-device-select">Device</Label>
                <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                  <SelectTrigger id="export-device-select" className="w-64" aria-label="Filter by device type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_TYPES.map((device) => (
                      <SelectItem key={device.code} value={device.code}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Screenshots Section */}
          <section aria-label="Screenshots">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-lg font-semibold">Screenshots</h2>
              <Badge variant="secondary" aria-label={`${filteredScreenshots.length} screenshots`}>
                {filteredScreenshots.length}
              </Badge>
            </div>

            {isLoadingScreenshots ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground" role="status">Loading screenshots...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredScreenshots.map((screenshot) => (
                  <ScreenshotCard
                    key={screenshot.id}
                    screenshot={screenshot}
                    onDelete={handleDeleteScreenshot}
                  />
                ))}
                <UploadDropZone
                  onUpload={handleUploadScreenshot}
                  isUploading={isUploading}
                />
              </div>
            )}
          </section>

          <Separator />

          {/* Metadata Section */}
          <section aria-label="Metadata">
            <h2 className="mb-3 text-lg font-semibold">Metadata</h2>

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
                      <Label htmlFor="export-meta-name">App Name</Label>
                      <CharCount current={metadata.name.length} max={30} />
                    </div>
                    <Input
                      id="export-meta-name"
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
                      <Label htmlFor="export-meta-subtitle">Subtitle</Label>
                      <CharCount current={metadata.subtitle.length} max={30} />
                    </div>
                    <Input
                      id="export-meta-subtitle"
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
                      <Label htmlFor="export-meta-description">Description</Label>
                      <CharCount current={metadata.description.length} max={4000} />
                    </div>
                    <Textarea
                      id="export-meta-description"
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
                      <Label htmlFor="export-meta-keywords">Keywords</Label>
                      <CharCount current={metadata.keywords.length} max={100} />
                    </div>
                    <Input
                      id="export-meta-keywords"
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
                      <Label htmlFor="export-meta-whats-new">What's New</Label>
                      <CharCount current={metadata.whatsNew.length} max={4000} />
                    </div>
                    <Textarea
                      id="export-meta-whats-new"
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
                    <Label htmlFor="export-meta-support-url">Support URL</Label>
                    <Input
                      id="export-meta-support-url"
                      type="url"
                      value={metadata.supportUrl}
                      onChange={(e) => handleFieldChange('supportUrl', e.target.value)}
                      placeholder="https://example.com/support"
                      aria-label="Support URL"
                    />
                  </div>

                  {/* Marketing URL */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="export-meta-marketing-url">Marketing URL</Label>
                    <Input
                      id="export-meta-marketing-url"
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
                      disabled={isSaving || !selectedApp}
                      aria-label="Save metadata changes to App Store Connect"
                    >
                      {isSaving ? 'Saving...' : 'Save to App Store Connect'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

        </div>
      </div>
    </>
  );
}
