/**
 * App picker dropdown for the Header bar
 *
 * Shows a list of apps from the AppContext with the currently selected app.
 * Includes a "Create New App" option that opens a dialog for entering an app name.
 *
 * @component
 * @returns {JSX.Element} Compact app selector dropdown
 */
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { useApp } from './AppContext.jsx';

/** Sentinel value used to trigger the create-app dialog */
const CREATE_NEW_VALUE = '__create_new__';

export default function AppPicker() {
  const { apps, selectedApp, isLoadingApps, setSelectedApp, addApp } = useApp();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAppName, setNewAppName] = useState('');

  /**
   * Handle value change from the Select dropdown
   *
   * Opens the create dialog when the sentinel value is selected,
   * otherwise finds and sets the selected app.
   *
   * @param {string} value - Selected app id or CREATE_NEW_VALUE sentinel
   */
  function handleValueChange(value) {
    if (value === CREATE_NEW_VALUE) {
      setNewAppName('');
      setIsDialogOpen(true);
      return;
    }
    const app = apps.find((a) => a.id === value);
    if (app) {
      setSelectedApp({
        id: app.id,
        name: app.attributes?.name || app.name || app.id
      });
    }
  }

  /** Create a new app from the dialog input and close the dialog */
  function handleCreateApp() {
    const trimmed = newAppName.trim();
    if (!trimmed) return;
    addApp(trimmed);
    setIsDialogOpen(false);
    setNewAppName('');
  }

  return (
    <>
      <Select
        value={selectedApp?.id || ''}
        onValueChange={handleValueChange}
      >
        <SelectTrigger className="h-8 w-auto min-w-48 max-w-64" aria-label="Select an app">
          <SelectValue placeholder="Select App">{selectedApp?.name || 'Select App'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {isLoadingApps ? (
            <SelectItem value="_loading" disabled>Loading...</SelectItem>
          ) : (
            apps.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.attributes?.name || app.name || "Untitled App"}
              </SelectItem>
            ))
          )}
          <Separator className="my-1" />
          <SelectItem value={CREATE_NEW_VALUE}>+ Create New App</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create New App</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Label htmlFor="new-app-name">App Name</Label>
            <Input
              id="new-app-name"
              value={newAppName}
              onChange={(e) => setNewAppName(e.target.value)}
              placeholder="My App"
              aria-label="New app name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateApp();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              aria-label="Cancel creating new app"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateApp}
              disabled={!newAppName.trim()}
              aria-label="Create new app"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
