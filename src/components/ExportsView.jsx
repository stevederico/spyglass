/**
 * Exports view for managing App Store Connect screenshots
 *
 * Provides filtering by language and device type. Displays a responsive
 * grid of screenshot thumbnails with upload/delete capabilities.
 * Uses shared AppContext for app selection via the Header AppPicker.
 *
 * @component
 * @returns {JSX.Element} Screenshot management interface
 */
import { useState, useEffect, useRef } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { AspectRatio } from '@stevederico/skateboard-ui/shadcn/ui/aspect-ratio';
import { Alert, AlertDescription } from '@stevederico/skateboard-ui/shadcn/ui/alert';
import { toast } from 'sonner';
import { useApp } from './AppContext.jsx';
import AppPicker from './AppPicker.jsx';

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
  { code: 'APP_IPHONE_69', name: 'iPhone 6.9"' },
  { code: 'APP_IPHONE_67', name: 'iPhone 6.7"' },
  { code: 'APP_IPHONE_65', name: 'iPhone 6.3"' },
  { code: 'APP_IPHONE_61', name: 'iPhone 6.1"' },
  { code: 'APP_IPHONE_55', name: 'iPhone 5.5"' },
  { code: 'APP_IPHONE_47', name: 'iPhone 4.7"' },
  { code: 'APP_IPAD_PRO_13', name: 'iPad 13"' },
  { code: 'APP_IPAD_PRO_129', name: 'iPad 12.9"' },
  { code: 'APP_IPAD_AIR_11', name: 'iPad 11"' },
  { code: 'APP_IPAD_105', name: 'iPad 10.5"' }
];

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
  const { selectedApp, isConnected } = useApp();
  const [selectedLocale, setSelectedLocale] = useState('all');
  const [selectedDevice, setSelectedDevice] = useState('all');

  const [screenshots, setScreenshots] = useState([]);
  const [isLoadingScreenshots, setIsLoadingScreenshots] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const headerFileInputRef = useRef(null);

  // Upload dialog state
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [ascApps, setAscApps] = useState([]);
  const [isLoadingAscApps, setIsLoadingAscApps] = useState(false);
  const [selectedAscApp, setSelectedAscApp] = useState('');

  /**
   * Handle file selection — stage file and open ASC app picker dialog
   *
   * @param {File} file - Image file to upload
   */
  function handleFileSelected(file) {
    setPendingFile(file);
    setSelectedAscApp('');
    setIsUploadDialogOpen(true);
    fetchAscApps();
  }

  /** Fetch ASC apps for the upload dialog picker */
  async function fetchAscApps() {
    setIsLoadingAscApps(true);
    try {
      const result = await apiRequest('/asc/apps');
      setAscApps(result?.data || []);
    } catch {
      toast.error('Failed to load App Store Connect apps');
      setAscApps([]);
    } finally {
      setIsLoadingAscApps(false);
    }
  }

  /**
   * Upload the pending file to the selected ASC app
   */
  async function handleConfirmUpload() {
    if (!pendingFile || !selectedAscApp) return;
    setIsUploading(true);
    setIsUploadDialogOpen(false);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      if (selectedLocale !== 'all') formData.append('locale', selectedLocale);
      if (selectedDevice !== 'all') formData.append('deviceType', selectedDevice);

      await apiRequest(`/asc/apps/${selectedAscApp}/screenshots`, {
        method: 'POST',
        body: formData
      });
      toast.success('Screenshot uploaded to App Store Connect');
    } catch {
      toast.error('Failed to upload screenshot');
    } finally {
      setIsUploading(false);
      setPendingFile(null);
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
      <Header title="" className="[&>div>div:last-child]:ml-0 [&>div>div:last-child]:flex-1">
        <AppPicker />
        <div className="flex-1" />
        {selectedApp && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => headerFileInputRef.current?.click()}
              disabled={isUploading}
              aria-label="Upload screenshot"
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
            <input
              ref={headerFileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
                e.target.value = '';
              }}
              className="hidden"
              aria-hidden="true"
            />
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

          {/* Filter Bar */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:flex-wrap">
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
                  onUpload={handleFileSelected}
                  isUploading={isUploading}
                />
              </div>
            )}
          </section>

          {/* ASC not connected info */}
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

        </div>
      </div>
      )}

      {/* Upload to ASC dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Upload to App Store Connect</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Label htmlFor="asc-app-select">Select App</Label>
            <Select value={selectedAscApp} onValueChange={setSelectedAscApp}>
              <SelectTrigger id="asc-app-select" aria-label="Select App Store Connect app">
                <SelectValue placeholder="Select an app" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingAscApps ? (
                  <SelectItem value="_loading" disabled>Loading...</SelectItem>
                ) : (
                  ascApps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.attributes?.name || app.id}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {pendingFile && (
              <p className="text-xs text-muted-foreground">
                File: {pendingFile.name}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadDialogOpen(false);
                setPendingFile(null);
              }}
              aria-label="Cancel upload"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUpload}
              disabled={!selectedAscApp || isUploading}
              aria-label="Upload screenshot to App Store Connect"
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
