/**
 * Metadata Precheck view
 *
 * Scans App Store metadata for common rejection triggers before submission.
 * Displays warnings color-coded by severity.
 *
 * @component
 * @returns {JSX.Element} Precheck interface
 */
import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Textarea } from '@stevederico/skateboard-ui/shadcn/ui/textarea';
import { useState, useRef } from "react";
import { apiRequest, getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '@stevederico/skateboard-ui/Context';
import { toast } from 'sonner';

/** Severity color mapping by rule ID */
const SEVERITY_COLORS = {
  negative_apple: 'text-red-500',
  competitor_mention: 'text-red-500',
  curse_words: 'text-red-500',
  future_functionality: 'text-orange-500',
  test_words: 'text-orange-500',
  placeholder_text: 'text-orange-500',
  free_iap: 'text-red-500',
  copyright_year: 'text-yellow-500',
  unreachable_url: 'text-yellow-500',
  price_mention: 'text-yellow-500'
};

/** Severity icon mapping by rule ID */
const SEVERITY_ICONS = {
  negative_apple: 'alert-circle',
  competitor_mention: 'alert-circle',
  curse_words: 'alert-circle',
  future_functionality: 'alert-triangle',
  test_words: 'alert-triangle',
  placeholder_text: 'alert-triangle',
  free_iap: 'alert-circle',
  copyright_year: 'info',
  unreachable_url: 'info',
  price_mention: 'info'
};

export default function PrecheckView() {
  const { state } = getState();
  const upgradeSheetRef = useRef();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [promotionalText, setPromotionalText] = useState('');
  const [warnings, setWarnings] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  /** Run precheck against all metadata fields */
  const handlePrecheck = async () => {
    if (!name && !description) return;

    const remaining = await getRemainingUsage();
    if (remaining === 0) {
      showUpgradeSheet(upgradeSheetRef);
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiRequest('/precheck', {
        method: 'POST',
        body: JSON.stringify({ name, description, keywords, promotionalText })
      });
      setWarnings(data.warnings);
      await trackUsage();
    } catch {
      toast.error('Failed to run precheck');
    }
    setIsLoading(false);
  };

  return (
    <>
      <Header title="Metadata Precheck" />

      <div className="flex flex-col h-screen bg-background">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">

          <p className="text-sm opacity-60">
            Scan your App Store metadata for common rejection triggers before submitting.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precheck-name">App Name</Label>
            <Input
              id="precheck-name"
              aria-label="App name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your app name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precheck-description">Description</Label>
            <Textarea
              id="precheck-description"
              aria-label="App Store description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="App Store description"
              rows={6}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precheck-keywords">Keywords</Label>
            <Input
              id="precheck-keywords"
              aria-label="Comma-separated keywords"
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="Comma-separated keywords"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precheck-promo">Promotional Text</Label>
            <div className="relative">
              <Input
                id="precheck-promo"
                aria-label="Promotional text, 170 character max"
                type="text"
                value={promotionalText}
                onChange={(e) => setPromotionalText(e.target.value.slice(0, 170))}
                placeholder="Optional, 170 character max"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-40" aria-live="polite">
                {promotionalText.length}/170
              </span>
            </div>
          </div>

          <Button
            onClick={handlePrecheck}
            disabled={isLoading || (!name && !description)}
            aria-label="Run metadata precheck"
            className="w-full"
            size="lg"
          >
            {isLoading ? 'Checking...' : 'Run Precheck'}
          </Button>

          {warnings !== null && (
            <div className="mt-2 flex flex-col gap-3">
              {warnings.length === 0 ? (
                <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <DynamicIcon name="check-circle" size={20} className="text-green-500 shrink-0" />
                  <div>
                    <p className="font-medium text-green-500">All Clear</p>
                    <p className="text-sm opacity-60">No rejection triggers found in your metadata.</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-medium opacity-70">{warnings.length} warning{warnings.length > 1 ? 's' : ''} found</p>
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-3 bg-accent rounded-lg p-4">
                      <DynamicIcon
                        name={SEVERITY_ICONS[w.id] || 'alert-triangle'}
                        size={20}
                        className={`${SEVERITY_COLORS[w.id] || 'text-yellow-500'} shrink-0 mt-0.5`}
                      />
                      <div>
                        <p className={`font-medium ${SEVERITY_COLORS[w.id] || 'text-yellow-500'}`}>{w.name}</p>
                        <p className="text-sm opacity-60 mt-1">{w.message}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <UpgradeSheet ref={upgradeSheetRef} userEmail={state.user?.email} />
    </>
  );
}
