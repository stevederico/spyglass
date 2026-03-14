/**
 * Apps dashboard view displaying connected App Store Connect apps
 *
 * Fetches apps from the backend API and renders them in a responsive card grid.
 * Shows an empty state prompting Settings configuration when no API key is set.
 *
 * @component
 * @returns {JSX.Element} Apps grid or empty state
 */
import { useNavigate } from 'react-router-dom';
import Header from '@stevederico/skateboard-ui/Header';
import { useListData } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { Empty } from '@stevederico/skateboard-ui/shadcn/ui/empty';

/** Background colors for app icon placeholders, cycled by index */
const ICON_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500'
];

/**
 * Generates a deterministic color class for an app icon based on index
 *
 * @param {number} index - App index in the list
 * @returns {string} Tailwind background color class
 */
function getIconColor(index) {
  return ICON_COLORS[index % ICON_COLORS.length];
}

export default function AppsView() {
  const navigate = useNavigate();
  const { data: apps, isLoading, error } = useListData('/asc/apps');

  /**
   * Navigate to the screenshots view with the selected app ID
   *
   * @param {string} appId - App Store Connect app identifier
   */
  function handleAppClick(appId) {
    navigate(`/screenshots?appId=${appId}`);
  }

  return (
    <>
      <Header title="Apps" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4 md:p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Spinner aria-label="Loading apps" />
            </div>
          )}

          {error && !isLoading && (
            <Empty
              title="Connect App Store Connect"
              description="Add your API credentials in Settings to see your apps here."
            >
              <Button
                onClick={() => navigate('/settings')}
                aria-label="Go to Settings to configure API credentials"
              >
                Go to Settings
              </Button>
            </Empty>
          )}

          {!isLoading && !error && apps?.length === 0 && (
            <Empty
              title="No Apps Found"
              description="No apps were found in your App Store Connect account."
            />
          )}

          {!isLoading && !error && apps?.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {apps.map((app, index) => (
                <Card
                  key={app.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => handleAppClick(app.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${app.attributes?.name || 'app'} screenshots and metadata`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleAppClick(app.id);
                    }
                  }}
                >
                  <CardHeader className="flex flex-row items-center gap-3">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white ${getIconColor(index)}`}
                      aria-hidden="true"
                    >
                      {(app.attributes?.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">
                        {app.attributes?.name || 'Unnamed App'}
                      </CardTitle>
                      <CardDescription className="truncate text-xs">
                        {app.attributes?.bundleId || 'No bundle ID'}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <Separator />
                  <CardContent className="flex items-center justify-between pt-4">
                    <Badge variant="secondary">
                      {app.attributes?.platform || 'iOS'}
                    </Badge>
                    <Badge
                      variant={app.attributes?.appStoreState === 'READY_FOR_SALE' ? 'default' : 'outline'}
                    >
                      {app.attributes?.appStoreState?.replace(/_/g, ' ') || 'Unknown'}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
