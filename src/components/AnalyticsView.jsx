/**
 * App Store Analytics view
 *
 * Displays impressions, page views, installs, and conversion rates
 * for apps connected via App Store Connect. Uses the existing ASC
 * credentials configured in Settings.
 *
 * @component
 * @returns {JSX.Element} Analytics dashboard
 */
import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { useState, useRef, useEffect } from "react";
import { apiRequest, getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '@stevederico/skateboard-ui/Context';
import { toast } from 'sonner';

export default function AnalyticsView() {
  const { state } = getState();
  const upgradeSheetRef = useRef();
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(true);

  /** Load apps from ASC on mount */
  useEffect(() => {
    let cancelled = false;
    const loadApps = async () => {
      try {
        const data = await apiRequest('/asc/apps');
        if (!cancelled) setApps(data);
      } catch {
        if (!cancelled) setHasCredentials(false);
      }
    };
    loadApps();
    return () => { cancelled = true; };
  }, []);

  /**
   * Fetch analytics metrics for the selected app.
   * @param {Object} app - App object with id and name
   */
  const handleSelectApp = async (app) => {
    const remaining = await getRemainingUsage();
    if (remaining === 0) {
      showUpgradeSheet(upgradeSheetRef);
      return;
    }

    setSelectedApp(app);
    setIsLoading(true);
    try {
      const data = await apiRequest(`/asc/analytics/metrics?appId=${app.id}`);
      setMetrics(data);
      await trackUsage();
    } catch {
      toast.error('Failed to fetch analytics');
    }
    setIsLoading(false);
  };

  if (!hasCredentials) {
    return (
      <>
        <Header title="Analytics" />
        <div className="flex flex-col h-screen bg-background">
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center flex flex-col items-center gap-4">
              <DynamicIcon name="key-round" size={48} className="opacity-30" />
              <div>
                <p className="font-medium mb-1">No App Store Connect credentials</p>
                <p className="text-sm opacity-60">Configure your ASC API key in Settings to use Analytics.</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Analytics" />

      <div className="flex flex-col h-screen bg-background">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

          {!selectedApp ? (
            <div className="flex flex-col gap-3">
              <p className="font-medium opacity-70">Select an App</p>
              {apps.length === 0 ? (
                <div className="text-center py-12 opacity-60">
                  <DynamicIcon name="loader" size={24} className="mx-auto mb-4 animate-spin" />
                  <p>Loading apps...</p>
                </div>
              ) : (
                apps.map(app => (
                  <button
                    key={app.id}
                    onClick={() => handleSelectApp(app)}
                    className="w-full flex items-center gap-4 p-4 bg-accent rounded-lg hover:opacity-80 transition-opacity text-left"
                    aria-label={`View analytics for ${app.name}`}
                  >
                    <DynamicIcon name="smartphone" size={20} className="opacity-50" />
                    <div>
                      <p className="font-medium">{app.name}</p>
                      <p className="text-sm opacity-60">{app.bundleId}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedApp.name}</p>
                  <p className="text-sm opacity-60">Last 30 days</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedApp(null); setMetrics(null); }}
                  aria-label="Switch app"
                >
                  Switch app
                </Button>
              </div>

              {isLoading ? (
                <div className="text-center py-8">
                  <DynamicIcon name="loader" size={24} className="mx-auto animate-spin opacity-60" />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm opacity-60">Impressions</p>
                      <p className="text-2xl font-bold">{metrics?.summary?.impressions ?? '--'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm opacity-60">Page Views</p>
                      <p className="text-2xl font-bold">{metrics?.summary?.pageViews ?? '--'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm opacity-60">Installs</p>
                      <p className="text-2xl font-bold">{metrics?.summary?.installs ?? '--'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm opacity-60">Conversion</p>
                      <p className="text-2xl font-bold">{metrics?.summary?.conversion ?? '--%'}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {metrics?.note && (
                <p className="text-sm opacity-50 text-center">{metrics.note}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <UpgradeSheet ref={upgradeSheetRef} userEmail={state.user?.email} />
    </>
  );
}
