/**
 * Localization view for translating marketing text into App Store Connect locales
 *
 * Provides source text inputs, batch translation via LibreTranslate API,
 * and an editable table of all 28 App Store locales with status tracking.
 *
 * @component
 * @returns {JSX.Element} Localization management interface
 */
import { useState, useCallback } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Progress } from '@stevederico/skateboard-ui/shadcn/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@stevederico/skateboard-ui/shadcn/ui/table';
import { ScrollArea } from '@stevederico/skateboard-ui/shadcn/ui/scroll-area';
import { toast } from 'sonner';

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

/** Locale codes that use English source text directly (no translation needed) */
const ENGLISH_LOCALES = new Set(['en-US', 'en-GB', 'en-AU', 'en-CA']);

/**
 * Return the appropriate Badge variant and label for a translation status
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

export default function LocalizationView() {
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [translations, setTranslations] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);

  /**
   * Translate source text into all non-English locales via batch API
   *
   * Sets English locales to source text with 'original' status,
   * then calls POST /translate/batch for all other locales.
   * Updates progress bar incrementally during translation.
   */
  const handleTranslateAll = useCallback(async () => {
    if (!line1.trim() && !line2.trim()) {
      toast.error('Enter at least one line of marketing text');
      return;
    }

    setIsTranslating(true);
    setProgress(0);

    const newTranslations = {};

    // Set English locales to source text
    for (const code of ENGLISH_LOCALES) {
      newTranslations[code] = {
        line1: line1,
        line2: line2,
        status: 'original'
      };
    }

    const nonEnglishLocales = LOCALES.filter((l) => !ENGLISH_LOCALES.has(l.code));
    const totalLocales = nonEnglishLocales.length;
    let completed = 0;

    // Set initial progress for English locales
    setProgress(Math.round((ENGLISH_LOCALES.size / LOCALES.length) * 100));
    setTranslations({ ...newTranslations });

    // Translate each non-English locale
    for (const locale of nonEnglishLocales) {
      try {
        const response = await apiRequest('/translate/batch', {
          method: 'POST',
          body: JSON.stringify({
            texts: [line1, line2],
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
          newTranslations[locale.code] = {
            line1: '',
            line2: '',
            status: 'error'
          };
        }
      } catch {
        newTranslations[locale.code] = {
          line1: '',
          line2: '',
          status: 'error'
        };
      }

      completed++;
      setProgress(Math.round(((ENGLISH_LOCALES.size + completed) / LOCALES.length) * 100));
      setTranslations({ ...newTranslations });
    }

    setIsTranslating(false);
    setProgress(100);
    toast.success('Translation complete');
  }, [line1, line2]);

  /**
   * Handle manual edit of a translated cell
   *
   * Updates the translation value and sets status to 'modified'
   * unless the locale is an English original.
   *
   * @param {string} localeCode - The locale code being edited
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

  /**
   * Copy all translations as JSON to clipboard
   *
   * Builds a structured object keyed by locale code and writes
   * it to the clipboard via the native Clipboard API.
   */
  const handleCopyAll = useCallback(async () => {
    if (Object.keys(translations).length === 0) {
      toast.error('No translations to copy');
      return;
    }

    const output = {};
    for (const locale of LOCALES) {
      const t = translations[locale.code];
      if (t) {
        output[locale.code] = {
          name: locale.name,
          line1: t.line1,
          line2: t.line2
        };
      }
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
      toast.success('Translations copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [translations]);

  const hasTranslations = Object.keys(translations).length > 0;

  return (
    <>
      <Header title="Localization" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4 md:p-6">

          {/* Source Text Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Source Text</CardTitle>
              <CardDescription>
                Enter the marketing text to translate into all App Store locales
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="source-line1">Line 1</Label>
                <Input
                  id="source-line1"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  placeholder="Track Your Fitness"
                  disabled={isTranslating}
                  aria-label="Marketing text line 1"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="source-line2">Line 2</Label>
                <Input
                  id="source-line2"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  placeholder="Reach Your Goals"
                  disabled={isTranslating}
                  aria-label="Marketing text line 2"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleTranslateAll}
                  disabled={isTranslating || (!line1.trim() && !line2.trim())}
                  aria-label="Translate text into all locales"
                >
                  {isTranslating ? 'Translating...' : 'Translate All'}
                </Button>
                {hasTranslations && (
                  <Button
                    variant="outline"
                    onClick={handleCopyAll}
                    disabled={isTranslating}
                    aria-label="Copy all translations as JSON"
                  >
                    Copy All
                  </Button>
                )}
              </div>

              {isTranslating && (
                <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
                  <Progress value={progress} aria-label="Translation progress" />
                  <p className="text-xs text-muted-foreground">
                    Translating... {progress}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Translations Table */}
          {hasTranslations && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Translations</CardTitle>
                <CardDescription>
                  Edit any cell to override the automated translation
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Language</TableHead>
                        <TableHead className="w-[100px]">Locale</TableHead>
                        <TableHead>Line 1</TableHead>
                        <TableHead>Line 2</TableHead>
                        <TableHead className="w-[110px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {LOCALES.map((locale) => {
                        const t = translations[locale.code];
                        if (!t) return null;

                        const { label, variant } = getStatusBadge(t.status);

                        return (
                          <TableRow key={locale.code}>
                            <TableCell className="font-medium">
                              {locale.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {locale.code}
                            </TableCell>
                            <TableCell>
                              <Input
                                value={t.line1}
                                onChange={(e) => handleCellEdit(locale.code, 'line1', e.target.value)}
                                disabled={isTranslating}
                                aria-label={`${locale.name} line 1 translation`}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={t.line2}
                                onChange={(e) => handleCellEdit(locale.code, 'line2', e.target.value)}
                                disabled={isTranslating}
                                aria-label={`${locale.name} line 2 translation`}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Badge variant={variant}>{label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </>
  );
}
