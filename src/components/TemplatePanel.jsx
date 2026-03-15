/**
 * Template management panel for saving and loading screenshot presets
 *
 * Simple dropdown to pick a saved template, plus a save button to create
 * new templates from current state. Includes font management with upload
 * and selection of custom fonts. Seeds starter templates on first load.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.currentState - Current screenshot state to save as template
 * @param {Function} props.onLoadTemplate - Callback to apply template settings
 * @param {string} props.appId - Current app ID for filtering templates
 * @param {string} props.selectedFont - Currently selected font family name
 * @param {Function} props.onFontChange - Callback when font selection changes
 * @returns {JSX.Element} Template management panel
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { toast } from 'sonner';
import { STARTER_TEMPLATES } from './composerHelpers.js';

export default function TemplatePanel({ currentState, onLoadTemplate, appId, selectedFont, onFontChange }) {
  const [templates, setTemplates] = useState([]);
  const [fonts, setFonts] = useState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [templateSelectKey, setTemplateSelectKey] = useState(0);
  const fontInputRef = useRef(null);
  const seededRef = useRef(new Set());

  /**
   * Fetch templates for the current app from the API
   *
   * @returns {Promise<Object[]>} Array of template objects
   */
  const fetchTemplates = useCallback(async () => {
    if (!appId) return;
    try {
      const data = await apiRequest(`/templates?appId=${encodeURIComponent(appId)}`);
      setTemplates(Array.isArray(data) ? data : []);
      return data;
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      return [];
    }
  }, [appId]);

  /** Fetch custom fonts from the API and load them via FontFace */
  const fetchFonts = useCallback(async () => {
    try {
      const data = await apiRequest('/templates/fonts');
      const fontList = Array.isArray(data) ? data : [];
      setFonts(fontList);

      for (const font of fontList) {
        const fontUrl = `/api/templates/fonts/${font.id}/file`;
        try {
          const face = new FontFace(font.name, `url(${fontUrl})`);
          const loaded = await face.load();
          document.fonts.add(loaded);
        } catch {
          // Font may already be loaded or file missing
        }
      }
    } catch (err) {
      console.error('Failed to fetch fonts:', err);
    }
  }, []);

  /**
   * Seed starter templates for an app when none exist
   *
   * @param {string} id - App ID to seed templates for
   */
  const seedStarterTemplates = useCallback(async (id) => {
    if (seededRef.current.has(id)) return;
    seededRef.current.add(id);

    for (const starter of STARTER_TEMPLATES) {
      try {
        await apiRequest('/templates', {
          method: 'POST',
          body: JSON.stringify({
            name: starter.name,
            appId: id,
            settings: starter.settings
          })
        });
      } catch (err) {
        console.error('Failed to seed template:', err);
      }
    }

    await fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (!appId) return;

    (async () => {
      const data = await fetchTemplates();
      if (Array.isArray(data) && data.length === 0) {
        await seedStarterTemplates(appId);
      }
    })();

    fetchFonts();
  }, [appId, fetchTemplates, fetchFonts, seedStarterTemplates]);

  /** Save current screenshot state as a new template */
  const handleSave = useCallback(async () => {
    if (!templateName.trim()) {
      toast.error('Enter a template name');
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest('/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: templateName.trim(),
          appId,
          settings: currentState
        })
      });
      toast.success('Template saved');
      setIsDialogOpen(false);
      setTemplateName('');
      await fetchTemplates();
    } catch (err) {
      console.error('Failed to save template:', err);
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  }, [templateName, appId, currentState, fetchTemplates]);

  /**
   * Load a template by ID from the templates list
   *
   * @param {string} id - Template ID to load
   */
  function handleSelectTemplate(id) {
    const template = templates.find((t) => t.id === id);
    if (template?.settings) {
      onLoadTemplate(template.settings);
    }
    setTemplateSelectKey((k) => k + 1);
  }

  /**
   * Handle custom font file upload
   *
   * @param {Event} e - File input change event
   */
  const handleFontUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ttf', 'otf'].includes(ext)) {
      toast.error('Only TTF and OTF files are supported');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch('/api/templates/fonts', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      toast.success('Font uploaded');
      await fetchFonts();
    } catch (err) {
      console.error('Failed to upload font:', err);
      toast.error('Failed to upload font');
    }

    if (fontInputRef.current) {
      fontInputRef.current.value = '';
    }
  }, [fetchFonts]);

  return (
    <div className="px-3 py-2.5">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Templates</h3>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Select key={templateSelectKey} onValueChange={handleSelectTemplate}>
            <SelectTrigger className="h-7 flex-1 text-xs" aria-label="Select a template to load">
              <SelectValue placeholder="Load template..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setIsDialogOpen(true)} aria-label="Save current settings as a template">
            Save
          </Button>
        </div>

        {/* Font */}
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs text-muted-foreground">Font</span>
          <Select value={selectedFont || 'system-default'} onValueChange={(val) => onFontChange(val === 'system-default' ? '' : val)}>
            <SelectTrigger className="h-7 flex-1 text-xs" aria-label="Font family selection">
              <SelectValue>{selectedFont || 'System Default'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system-default">System Default</SelectItem>
              {fonts.map((font) => (
                <SelectItem key={font.id} value={font.name}>{font.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => fontInputRef.current?.click()} aria-label="Upload custom font file">
            Upload
          </Button>
          <input ref={fontInputRef} type="file" accept=".ttf,.otf" onChange={handleFontUpload} className="hidden" aria-label="Font file input" />
        </div>
      </div>

      {/* Save template dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Label htmlFor="template-name-input">Template Name</Label>
            <Input id="template-name-input" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="My Template" aria-label="Template name" onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} aria-label="Cancel saving template">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !templateName.trim()} aria-label="Confirm save template">{isSaving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
