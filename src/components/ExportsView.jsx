/**
 * Export package gallery showing completed screenshot + metadata bundles
 *
 * Displays packages created from the Screenshots batch export flow.
 * Each package contains screenshots across devices and locales, bundled
 * with metadata. Supports downloading as zip and deletion.
 *
 * @component
 * @returns {JSX.Element} Export package gallery
 */
import { useState, useEffect, useCallback } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest, getBackendURL } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { toast } from 'sonner';
import { useApp } from './AppContext.jsx';
import AppPicker from './AppPicker.jsx';

/**
 * Map a package status string to a Badge variant and display label
 *
 * @param {string} status - Package status (ready, uploaded, draft)
 * @returns {{ label: string, variant: string }} Badge display properties
 */
function getStatusBadge(status) {
  switch (status) {
    case 'ready': return { label: 'Ready', variant: 'default' };
    case 'uploaded': return { label: 'Uploaded', variant: 'secondary' };
    case 'draft': return { label: 'Draft', variant: 'outline' };
    default: return { label: status, variant: 'outline' };
  }
}

/**
 * Format a date string to a compact relative or absolute display
 *
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ExportsView() {
  const { selectedApp } = useApp();
  const [packages, setPackages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedFiles, setExpandedFiles] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  /**
   * Fetch export packages for a given app
   *
   * @param {string} appId - App identifier to filter packages by
   */
  const fetchPackages = useCallback(async (appId) => {
    setIsLoading(true);
    try {
      const result = await apiRequest(`/exports?appId=${encodeURIComponent(appId)}`);
      setPackages(result || []);
    } catch (err) {
      console.error('Failed to fetch packages:', err);
      toast.error('Failed to load export packages');
      setPackages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch files for a specific export package
   *
   * @param {string} id - Package identifier
   */
  const fetchPackageFiles = useCallback(async (id) => {
    try {
      const result = await apiRequest(`/exports/${id}`);
      setExpandedFiles(result?.files || []);
    } catch (err) {
      console.error('Failed to fetch package files:', err);
      toast.error('Failed to load package files');
      setExpandedFiles([]);
    }
  }, []);

  useEffect(() => {
    if (selectedApp?.id) {
      fetchPackages(selectedApp.id);
      setExpandedId(null);
      setExpandedFiles(null);
    } else {
      setPackages([]);
    }
  }, [selectedApp?.id, fetchPackages]);

  /**
   * Download an export package as a zip file
   *
   * @param {Object} pkg - Package object with id and app_name
   */
  const handleDownload = useCallback(async (pkg) => {
    setDownloadingId(pkg.id);
    try {
      const response = await fetch(`${getBackendURL()}/exports/${pkg.id}/download`, { credentials: 'include' });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pkg.app_name}-export.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('Failed to download export package');
    } finally {
      setDownloadingId(null);
    }
  }, []);

  /**
   * Delete an export package by id
   *
   * @param {string} id - Package identifier to delete
   */
  const handleDelete = useCallback(async (id) => {
    try {
      await apiRequest(`/exports/${id}`, { method: 'DELETE' });
      setPackages((prev) => prev.filter((p) => p.id !== id));
      setDeleteId(null);
      if (expandedId === id) {
        setExpandedId(null);
        setExpandedFiles(null);
      }
      toast.success('Export package deleted');
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to delete export package');
    }
  }, [expandedId]);

  /**
   * Toggle expanded preview for a package, fetching files if expanding
   *
   * @param {string} id - Package identifier to toggle
   */
  const handleExpand = useCallback((id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedFiles(null);
    } else {
      setExpandedId(id);
      setExpandedFiles(null);
      fetchPackageFiles(id);
    }
  }, [expandedId, fetchPackageFiles]);

  return (
    <>
      <Header title="" className="[&>div>div:last-child]:ml-0">
        <AppPicker />
      </Header>

      {!selectedApp ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Select an app to get started</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner aria-label="Loading export packages" />
        </div>
      ) : packages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/50" aria-hidden="true">
            <rect x="2" y="3" width="20" height="18" rx="2" />
            <path d="M2 9h20" />
            <path d="M10 3v6" />
          </svg>
          <p className="text-sm text-muted-foreground">No exports yet</p>
          <p className="text-xs text-muted-foreground/60">Create one from Screenshots using Batch Export</p>
        </div>
      ) : (
        <div className="flex flex-col gap-px p-3">
          {packages.map((pkg) => {
            const { label: statusLabel, variant: statusVariant } = getStatusBadge(pkg.status);
            const isExpanded = expandedId === pkg.id;

            return (
              <div key={pkg.id} className="package-card">
                {/* Package row */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    className="flex flex-1 items-center gap-3 text-left"
                    onClick={() => handleExpand(pkg.id)}
                    aria-label={isExpanded ? `Collapse ${pkg.app_name}` : `Expand ${pkg.app_name}`}
                    aria-expanded={isExpanded}
                  >
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
                      className={`shrink-0 text-muted-foreground/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      aria-hidden="true"
                    >
                      <path d="M3 1l4 4-4 4z" />
                    </svg>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium truncate">{pkg.app_name}</span>
                        <Badge variant={statusVariant} className="badge-compact">{statusLabel}</Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground/40">
                        {pkg.screenshot_count} screenshots · {pkg.locales?.length || 0} locales · {pkg.devices?.length || 0} devices
                      </span>
                    </div>
                  </button>
                  <span className="shrink-0 text-[10px] text-muted-foreground/30">{formatDate(pkg.created_at)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => handleDownload(pkg)}
                    disabled={downloadingId === pkg.id}
                    aria-label={`Download ${pkg.app_name} as zip`}
                    data-umami-event="export-downloaded"
                  >
                    {downloadingId === pkg.id ? '...' : 'Download'}
                  </Button>
                  <button
                    className="shrink-0 rounded p-1 text-muted-foreground/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteId(pkg.id)}
                    aria-label={`Delete ${pkg.app_name} export`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </div>

                {/* Expanded file grid */}
                {isExpanded && (
                  <div className="border-t border-border/50 bg-muted/20 px-3 py-3">
                    {expandedFiles === null ? (
                      <div className="flex items-center justify-center py-4">
                        <Spinner className="h-4 w-4" aria-label="Loading previews" />
                      </div>
                    ) : expandedFiles.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">No preview files available</p>
                    ) : (
                      <>
                        <div className="mb-2 flex flex-wrap gap-1">
                          {(pkg.locales || []).map((l) => (
                            <span key={l} className="rounded bg-accent px-1.5 py-0.5 text-[9px] text-muted-foreground/60">{l}</span>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                          {expandedFiles.map((file) => (
                            <div key={file.id} className="group relative">
                              <img
                                src={`${getBackendURL()}/exports/${pkg.id}/files/${file.id}`}
                                alt={`${file.locale} ${file.device}`}
                                className="w-full rounded border border-border/30 object-contain"
                                loading="lazy"
                              />
                              <span className="absolute bottom-0 left-0 right-0 truncate rounded-b bg-foreground/60 px-1 py-0.5 text-center text-[8px] text-background/70 opacity-0 transition-opacity group-hover:opacity-100">
                                {file.locale}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Delete Export Package</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this export and all its screenshots.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} aria-label="Cancel deletion">Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteId)} aria-label="Confirm delete">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
