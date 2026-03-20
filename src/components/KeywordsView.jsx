/**
 * Keyword Research view
 *
 * Search the App Store by keyword to see which apps rank for each term.
 * Results show rank, icon, name, developer, rating, and price.
 *
 * @component
 * @returns {JSX.Element} Keyword research interface
 */
import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { useState, useRef } from "react";
import { apiRequest, getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '@stevederico/skateboard-ui/Context';
import { toast } from 'sonner';

export default function KeywordsView() {
  const { state } = getState();
  const upgradeSheetRef = useRef();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  /** Search for apps matching the keyword */
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    const remaining = await getRemainingUsage();
    if (remaining === 0) {
      showUpgradeSheet(upgradeSheetRef);
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiRequest(`/keywords/search?term=${encodeURIComponent(searchTerm)}`);
      setResults(data);
      await trackUsage();
    } catch {
      toast.error('Search failed. Please try again.');
    }
    setIsLoading(false);
  };

  return (
    <>
      <Header title="Keywords" />

      <div className="flex flex-col h-screen bg-background">
        <div className="p-4 border-b bg-background">
          <Label htmlFor="keyword-search" className="sr-only">Search keywords</Label>
          <div className="flex gap-2">
            <Input
              id="keyword-search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search keywords..."
            />
            <Button
              onClick={handleSearch}
              disabled={isLoading}
              aria-label="Search"
            >
              <DynamicIcon name="search" size={18} />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {results.length === 0 ? (
            <div className="text-center py-12 opacity-60">
              <DynamicIcon name="search" size={32} className="mx-auto mb-4 opacity-50" />
              <p>Search for App Store keywords to see rankings</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {results.map((result, i) => (
                <a
                  key={i}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 p-4 bg-accent rounded-lg hover:opacity-80 transition-opacity"
                  aria-label={`${result.name} by ${result.developer}, ranked #${result.rank}`}
                >
                  <span className="text-sm opacity-40 w-6 text-right">{result.rank}</span>
                  <img src={result.icon} alt={`${result.name} icon`} className="size-10 rounded-lg" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{result.name}</p>
                    <p className="text-sm opacity-60 truncate">{result.developer}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p>{result.rating} ★</p>
                    <p className="opacity-60">{result.price}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <UpgradeSheet ref={upgradeSheetRef} userEmail={state.user?.email} />
    </>
  );
}
