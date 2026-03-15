/**
 * Export package gallery showing completed screenshot + metadata bundles
 *
 * Displays packages created from Screenshots's batch export flow. Each package
 * contains screenshots across devices and locales, bundled with metadata.
 * Supports downloading as zip, uploading to ASC, and deletion.
 *
 * @component
 * @returns {JSX.Element} Export package gallery
 */
import { useState, useEffect, useCallback } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
import { ScrollArea } from '@stevederico/skateboard-ui/shadcn/ui/scroll-area';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
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

export default function ExportsView() {
  const { selectedApp } = useApp();
  const [packages, setPackages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedFiles, setExpandedFiles] = useState([]);
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
      setExpandedFiles([]);
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
      const response = await fetch(`/api/exports/${pkg.id}/download`, {
        credentials: 'include'
      });
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
        setExpandedFiles([]);
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
      setExpandedFiles([]);
    } else {
      setExpandedId(id);
      setExpandedFiles([]);
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
          <p className="text-muted-foreground">Select an app to get started</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner aria-label="Loading export packages" />
        </div>
      ) : packages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-lg font-medium text-muted-foreground">No exports yet</p>
          <p className="text-sm text-muted-foreground">Create one from Screenshots using Batch Export</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 md:p-6">
          {packages.map((pkg) => (
            <Card key={pkg.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{pkg.app_name}</CardTitle>
                    <Badge variant={getStatusBadge(pkg.status).variant}>
                      {getStatusBadge(pkg.status).label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(pkg.created_at).toLocaleDateString()}
                  </p>
                </div>
                <CardDescription>
                  {pkg.locales?.length || 0} locales · {pkg.devices?.length || 0} devices · {pkg.screenshot_count} screenshots
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {/* Locale badges */}
                <div className="flex flex-wrap gap-1">
                  {(pkg.locales || []).slice(0, 8).map((l) => (
                    <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>
                  ))}
                  {(pkg.locales || []).length > 8 && (
                    <Badge variant="outline" className="text-[10px]">+{pkg.locales.length - 8} more</Badge>
                  )}
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExpand(pkg.id)}
                    aria-label={expandedId === pkg.id ? 'Collapse package details' : 'Expand package details'}
                  >
                    {expandedId === pkg.id ? 'Collapse' : 'Preview'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(pkg)}
                    disabled={downloadingId === pkg.id}
                    aria-label={`Download ${pkg.app_name} export as zip`}
                  >
                    {downloadingId === pkg.id ? 'Downloading...' : 'Download Zip'}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(pkg.id)}
                    aria-label={`Delete ${pkg.app_name} export package`}
                  >
                    Delete
                  </Button>
                </div>

                {/* Expanded preview */}
                {expandedId === pkg.id && (
                  <div className="mt-2 rounded-md border p-3">
                    {expandedFiles.length === 0 ? (
                      <p className="text-sm text-muted-foreground" role="status">Loading previews...</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {expandedFiles.map((file) => (
                          <div key={file.id} className="flex flex-col items-center gap-1">
                            <img
                              src={`/api/exports/${pkg.id}/files/${file.id}`}
                              alt={`${file.locale} ${file.device} screenshot`}
                              className="w-full rounded border object-contain"
                              loading="lazy"
                            />
                            <p className="text-[10px] text-muted-foreground text-center truncate w-full">
                              {file.locale}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Delete Export Package</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this export package and all its screenshots. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} aria-label="Cancel deletion">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(deleteId)}
              aria-label="Confirm delete export package"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
