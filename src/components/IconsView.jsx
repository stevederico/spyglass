/**
 * Icon Resizer view
 *
 * Upload a 1024x1024 PNG and generate all required iOS app icon sizes.
 * Downloads a ZIP containing icons for every required size.
 *
 * @component
 * @returns {JSX.Element} Icon resizer interface
 */
import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { useState, useRef } from 'react';
import { getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '@stevederico/skateboard-ui/Context';
import { toast } from 'sonner';

export default function IconsView() {
  const { state } = getState();
  const upgradeSheetRef = useRef();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  /** @param {DragEvent} e */
  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'image/png') {
      setFile(dropped);
      setPreview(URL.createObjectURL(dropped));
    }
  };

  /** @param {Event} e */
  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.type === 'image/png') {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  /** Generate all icon sizes and download as ZIP */
  const handleGenerate = async () => {
    if (!file) return;

    const remaining = await getRemainingUsage();
    if (remaining === 0) {
      showUpgradeSheet(upgradeSheetRef);
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/icons/resize', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to resize icons');
        setIsLoading(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'app-icons.zip';
      a.click();
      URL.revokeObjectURL(url);

      await trackUsage();
    } catch {
      toast.error('Failed to resize icons');
    }
    setIsLoading(false);
  };

  return (
    <>
      <Header title="Icon Resizer" />

      <div className="flex flex-col h-screen bg-background">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a 1024x1024 PNG here or click to upload"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('icon-upload').click()}
            onKeyDown={(e) => e.key === 'Enter' && document.getElementById('icon-upload').click()}
            className="border-2 border-dashed border-accent rounded-lg p-12 text-center cursor-pointer hover:border-app transition-colors"
          >
            {preview ? (
              <img src={preview} alt="Icon preview" className="size-32 mx-auto rounded-lg" />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <DynamicIcon name="upload" size={32} className="opacity-50" />
                <p className="opacity-60">Drop a 1024x1024 PNG here or click to upload</p>
              </div>
            )}
            <input
              id="icon-upload"
              type="file"
              accept="image/png"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Upload PNG icon"
            />
          </div>

          {file && (
            <Button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? 'Generating...' : 'Generate All Sizes'}
            </Button>
          )}
        </div>
      </div>

      <UpgradeSheet ref={upgradeSheetRef} userEmail={state.user?.email} />
    </>
  );
}
