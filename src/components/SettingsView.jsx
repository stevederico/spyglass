/**
 * Settings view for configuring App Store Connect API credentials
 *
 * Provides a form to enter Key ID, Issuer ID, and private key (.p8),
 * tests the connection, and persists credentials via the backend.
 *
 * @component
 * @returns {JSX.Element} Settings configuration form
 */
import { useState, useEffect, useRef } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Textarea } from '@stevederico/skateboard-ui/shadcn/ui/textarea';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import { toast } from 'sonner';

/** Possible API connection states */
const STATUS = {
  UNKNOWN: 'unknown',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  TESTING: 'testing'
};

export default function SettingsView() {
  const [keyId, setKeyId] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(STATUS.UNKNOWN);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);

  /** Test the current connection on mount */
  useEffect(() => {
    testConnection();
  }, []);

  /** Probe the backend to determine if ASC credentials are configured */
  async function testConnection() {
    setConnectionStatus(STATUS.TESTING);
    try {
      const result = await apiRequest('/asc/apps');
      if (result?.data) {
        setConnectionStatus(STATUS.CONNECTED);
      } else {
        setConnectionStatus(STATUS.DISCONNECTED);
      }
    } catch {
      setConnectionStatus(STATUS.DISCONNECTED);
    }
  }

  /**
   * Handle .p8 file upload and read contents into state
   *
   * @param {Event} e - File input change event
   */
  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setPrivateKey(event.target.result);
    };
    reader.onerror = () => {
      toast.error('Failed to read file');
    };
    reader.readAsText(file);
  }

  /** Save API credentials and test the connection */
  async function handleConnect() {
    if (!keyId.trim() || !issuerId.trim() || !privateKey.trim()) {
      toast.error('All fields are required');
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest('/asc/credentials', {
        method: 'POST',
        body: JSON.stringify({
          keyId: keyId.trim(),
          issuerId: issuerId.trim(),
          privateKey: privateKey.trim()
        })
      });
      toast.success('Credentials saved');
      await testConnection();
    } catch {
      toast.error('Failed to save credentials');
      setConnectionStatus(STATUS.DISCONNECTED);
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Render connection status badge
   *
   * @returns {JSX.Element} Badge indicating current connection state
   */
  function renderStatusBadge() {
    switch (connectionStatus) {
      case STATUS.CONNECTED:
        return <Badge className="bg-green-500 text-white">Connected</Badge>;
      case STATUS.DISCONNECTED:
        return <Badge variant="destructive">Disconnected</Badge>;
      case STATUS.TESTING:
        return <Badge variant="secondary">Testing...</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  }

  return (
    <>
      <Header title="Settings" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4 md:p-6">
          {/* Connection Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Connection Status</CardTitle>
                <CardDescription>App Store Connect API</CardDescription>
              </div>
              {renderStatusBadge()}
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={testConnection}
                disabled={connectionStatus === STATUS.TESTING}
                aria-label="Test App Store Connect connection"
              >
                {connectionStatus === STATUS.TESTING ? 'Testing...' : 'Test Connection'}
              </Button>
            </CardContent>
          </Card>

          {/* API Credentials Form */}
          <Card>
            <CardHeader>
              <CardTitle>API Credentials</CardTitle>
              <CardDescription>
                Enter your App Store Connect API key details. You can create API keys in
                <a
                  href="https://appstoreconnect.apple.com/access/integrations/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-blue-500 underline"
                  aria-label="Open App Store Connect API keys page in a new tab"
                >
                  App Store Connect &gt; Users and Access &gt; Integrations &gt; App Store Connect API
                </a>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {/* Key ID */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-key-id">Key ID</Label>
                <Input
                  id="settings-key-id"
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                  placeholder="e.g. ABC1234DEF"
                  aria-label="App Store Connect API Key ID"
                />
                <p className="text-xs text-muted-foreground">
                  Found in the API keys table under Key ID
                </p>
              </div>

              {/* Issuer ID */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-issuer-id">Issuer ID</Label>
                <Input
                  id="settings-issuer-id"
                  value={issuerId}
                  onChange={(e) => setIssuerId(e.target.value)}
                  placeholder="e.g. 69a6de7e-1234-47e3-e053-5b8c7c11a4d1"
                  aria-label="App Store Connect Issuer ID"
                />
                <p className="text-xs text-muted-foreground">
                  Found at the top of the API keys page
                </p>
              </div>

              <Separator />

              {/* Private Key */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-private-key">Private Key (.p8)</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload .p8 private key file"
                  >
                    Upload .p8 File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".p8"
                    onChange={handleFileUpload}
                    className="hidden"
                    aria-hidden="true"
                  />
                  {privateKey && (
                    <Badge variant="secondary" aria-label="Private key loaded">
                      Key loaded
                    </Badge>
                  )}
                </div>
                <Textarea
                  id="settings-private-key"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  rows={5}
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;Paste your .p8 key contents here...&#10;-----END PRIVATE KEY-----"
                  className="font-mono text-xs"
                  aria-label="Private key contents, paste or upload .p8 file"
                />
                <p className="text-xs text-muted-foreground">
                  Upload the .p8 file or paste the key contents directly. This key can only be downloaded once from App Store Connect.
                </p>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  onClick={handleConnect}
                  disabled={isSaving || !keyId.trim() || !issuerId.trim() || !privateKey.trim()}
                  aria-label="Save credentials and connect to App Store Connect"
                >
                  {isSaving ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Go to{' '}
                  <a
                    href="https://appstoreconnect.apple.com/access/integrations/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                    aria-label="Open App Store Connect API integrations page"
                  >
                    App Store Connect &gt; Users and Access &gt; Integrations
                  </a>
                </li>
                <li>Click the "+" button to generate a new API key</li>
                <li>Give it a name (e.g., "Spyglass") and select "Admin" access</li>
                <li>Copy the <strong>Key ID</strong> and <strong>Issuer ID</strong> from the page</li>
                <li>Download the <strong>.p8 private key</strong> file (you can only download it once)</li>
                <li>Enter all three values above and click Connect</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
