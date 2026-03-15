  <p align="center" style="margin-top: 40px; margin-bottom: 5px;">
    <img src="public/icons/icon.png" width="60" height="60" alt="Spyglass Logo">
  </p>
  <h1 align="center" style="border-bottom: none; margin-bottom: 0;">Spyglass</h1>
  <h3 align="center" style="margin-top: 0; font-weight: normal;">
    App Store Connect screenshot and metadata manager
  </h3>
  <p align="center">
    <a href="https://opensource.org/licenses/mit">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License">
    </a>
    <a href="https://github.com/stevederico/spyglass/stargazers">
      <img src="https://img.shields.io/github/stars/stevederico/spyglass?style=social" alt="GitHub stars">
    </a>
  </p>

## Overview

Spyglass is a web app for creating, translating, and managing App Store screenshots and metadata. Design marketing screenshots with real device frames and text overlays, translate them into 28 languages, batch export for every device and locale, and push everything to App Store Connect.

Built on [Skateboard](https://github.com/stevederico/skateboard) with React 19, Hono, and Tailwind CSS v4.

## Features

**Screenshots** — Canvas-based screenshot composer
- Multi-screenshot slots with filmstrip navigation for managing multiple screenshots per locale
- Per-slot undo/redo with keyboard shortcuts (Cmd+Z / Cmd+Shift+Z)
- Slot duplicate, remove, and drag-to-reorder
- Solid color, gradient, image, or AI-generated backgrounds (via xAI Grok)
- Real device frame PNGs for iPhone 16/17 and iPad models with color variants
- Marketing text with Google Fonts or custom uploaded fonts, auto-fit sizing (16px minimum), shadow, and layer visibility toggles
- Portrait and landscape orientation support
- Selective locale translation into 28 App Store locales
- Template system with save/load/duplicate presets
- Drag-and-drop screenshot upload
- Session state persistence across page reloads

**Metadata** — App Store metadata editor
- Localized editing for name, subtitle, description, keywords, and what's new
- Character count validation per field
- AI-powered metadata generation via xAI Grok with tone selector
- Bulk metadata generation across fields
- AI copywriting improvement for existing text
- ASO keyword suggestions
- Diff view before saving
- Version history with snapshot restore
- Push metadata directly to App Store Connect API

**Exports** — Batch export and package management
- Multi-slot batch render across all devices and locales
- Export packages with thumbnail previews
- Zip download with ASC-ready file naming (fflate compression)
- Package status tracking

**Settings** — App Store Connect API integration
- JWT authentication with .p8 private key
- Connection status testing
- Credential management through the built-in Skateboard settings page
- Light and dark mode theme toggle

## Device Frames

Spyglass includes real device frame PNGs with multiple color options:

| Device | Colors |
|---|---|
| iPhone 17 Pro Max | Cosmic Orange, Deep Blue, Silver |
| iPhone 17 Pro | Cosmic Orange, Deep Blue, Silver |
| iPhone 17 | Black, Lavender, Mist Blue, Sage, White |
| iPhone Air | Cloud White, Light Gold, Sky Blue, Space Black |
| iPhone 16 Pro Max | Black Titanium, Desert Titanium, Natural Titanium, White Titanium |
| iPhone 16 Pro | Black Titanium, Desert Titanium, Natural Titanium, White Titanium |
| iPhone 16 Plus | Black, Pink, Teal, Ultramarine, White |
| iPhone 16 | Black, Pink, Teal, Ultramarine, White |
| iPad Pro 13" M4 | Silver, Space Gray |
| iPad Pro 11" M4 | Silver, Space Gray |
| iPad Air 13" M2 | Blue, Purple, Space Gray, Stardust |
| iPad Air 11" M2 | Blue, Purple, Space Gray, Stardust |
| iPad Mini | Starlight |

## Supported App Store Tiers

| Display Size | Resolution |
|---|---|
| iPhone 6.9" | 1320 x 2868 |
| iPhone 6.7" | 1290 x 2796 |
| iPhone 6.5" | 1284 x 2778 |
| iPhone 6.3" | 1206 x 2622 |
| iPhone 6.1" | 1179 x 2556 |
| iPad 13" | 2064 x 2752 |
| iPad 12.9" | 2048 x 2732 |
| iPad 11" | 1668 x 2388 |
| iPad 10.5" | 1668 x 2224 |

## Supported Locales

English (US, UK, AU, CA), Danish, German, Greek, Spanish (Spain, Mexico), Finnish, French (France, Canada), Indonesian, Italian, Japanese, Korean, Malay, Dutch, Norwegian, Portuguese (Brazil, Portugal), Russian, Swedish, Thai, Turkish, Chinese (Simplified, Traditional), Vietnamese

## Quick Start

```bash
git clone https://github.com/stevederico/spyglass.git
cd spyglass
npm install
npm run start
```

App runs at `http://localhost:5173`, backend at `http://localhost:8000`.

A default "My App" is created automatically so you can start composing screenshots immediately. Connect to App Store Connect later to sync real apps.

## App Store Connect Setup

1. Go to [App Store Connect > Users and Access > Integrations](https://appstoreconnect.apple.com/access/integrations/api)
2. Create a new API key with Admin access
3. Note the **Key ID** and **Issuer ID**
4. Download the **.p8 private key** (one-time download)
5. In Spyglass, go to **Settings** and enter all three values
6. Click **Connect**

## Backend Environment

Add to `backend/.env`:

```bash
JWT_SECRET=your-secret-key

# App Store Connect (configured via Settings UI, or set manually)
ASC_KEY_ID=your_key_id
ASC_ISSUER_ID=your_issuer_id
ASC_PRIVATE_KEY_PATH=./AuthKey.p8

# xAI Grok (optional, enables AI metadata generation and background images)
XAI_API_KEY=your_xai_api_key

# LibreTranslate (optional, defaults to public instance)
LIBRETRANSLATE_URL=https://libretranslate.com/translate
LIBRETRANSLATE_API_KEY=
```

## API Endpoints

### App Store Connect

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/asc/apps` | List all apps |
| GET | `/api/asc/apps/:id` | Get app details |
| GET | `/api/asc/apps/:id/versions` | Get app store versions |
| GET | `/api/asc/apps/:id/metadata` | Get app localizations |
| PATCH | `/api/asc/apps/:id/metadata` | Update localizations |
| GET | `/api/asc/apps/:id/screenshots` | Get screenshot sets |
| POST | `/api/asc/apps/:id/screenshots` | Upload screenshot (3-step) |
| DELETE | `/api/asc/screenshots/:id` | Delete screenshot |
| GET | `/api/asc/simulators` | List available iOS simulators (macOS only) |
| POST | `/api/asc/screenshots/capture` | Capture from iOS simulators (macOS only) |

### Translation

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/translate/text` | Translate single text |
| POST | `/api/translate/batch` | Translate to target locale |
| GET | `/api/translate/languages` | List available languages |

### Exports

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/exports` | List export packages |
| POST | `/api/exports` | Create export package with files |
| GET | `/api/exports/:id/download` | Download package as zip |
| GET | `/api/exports/:id/files/:fileId` | Get individual file |
| DELETE | `/api/exports/:id` | Delete export package |

### Templates

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/templates` | List saved templates |
| POST | `/api/templates` | Save a template |
| PATCH | `/api/templates/:id` | Update a template |
| POST | `/api/templates/:id/duplicate` | Duplicate a template |
| DELETE | `/api/templates/:id` | Delete a template |
| GET | `/api/templates/fonts` | List custom fonts |
| POST | `/api/templates/fonts` | Upload font file |
| GET | `/api/templates/fonts/:id/file` | Get font file |
| DELETE | `/api/templates/fonts/:id` | Delete custom font |

### Metadata History

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/metadata-history/:appId` | Get version history |
| POST | `/api/metadata-history` | Save metadata snapshot |
| GET | `/api/metadata-history/snapshot/:id` | Get snapshot by ID |
| DELETE | `/api/metadata-history/snapshot/:id` | Delete snapshot |

### AI (xAI Grok)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/generate-metadata` | Generate full metadata (name, subtitle, description, keywords, what's new) |
| POST | `/api/ai/generate-description` | Generate app description |
| POST | `/api/ai/generate-keywords` | Generate keyword suggestions |
| POST | `/api/ai/generate-whats-new` | Generate what's new text |
| POST | `/api/ai/improve-text` | Improve existing copywriting |
| POST | `/api/ai/suggest-keywords` | ASO keyword analysis |
| POST | `/api/ai/generate-background` | Generate AI background image |

## Project Structure

```
spyglass/
├── src/
│   ├── components/
│   │   ├── ScreenshotsView.jsx    # Screenshot composer
│   │   ├── MetadataView.jsx       # Metadata editor
│   │   ├── ExportsView.jsx        # Export package gallery
│   │   ├── LandingView.jsx        # Marketing landing page
│   │   ├── SettingsView.jsx       # ASC credentials
│   │   ├── AppContext.jsx         # Shared app selection state
│   │   ├── AppPicker.jsx          # App selector dropdown
│   │   ├── Filmstrip.jsx          # Horizontal slot thumbnail navigation
│   │   ├── TemplatePanel.jsx      # Template save/load panel
│   │   ├── BatchExportDialog.jsx  # Multi-slot batch export dialog
│   │   ├── composerHelpers.js     # Canvas drawing utilities
│   │   ├── frameManifest.js       # Device frame registry
│   │   ├── frameLoader.js         # Frame PNG lazy loader
│   │   ├── useSlots.js            # Multi-slot state management hook
│   │   ├── useSlotHistory.js      # Per-slot undo/redo hook
│   │   └── useSessionState.js     # Session-persistent state hook
│   ├── main.jsx                   # Routes and app config
│   ├── constants.json             # App configuration
│   └── assets/styles.css          # Theme overrides
├── public/frames/                 # Device frame PNGs
├── backend/
│   ├── server.js                  # Hono server
│   ├── asc.js                     # App Store Connect API routes
│   ├── translate.js               # Translation routes
│   ├── exports.js                 # Export package routes
│   ├── templates.js               # Template CRUD routes
│   ├── metadataHistory.js         # Metadata version history
│   ├── ai.js                      # AI metadata generation routes (xAI Grok)
│   └── adapters/                  # Database adapters (SQLite, PostgreSQL, MongoDB)
├── cli/                           # CLI tool (WIP)
└── package.json
```

## Testing

```bash
npm run test           # Run all tests
npm run test:watch     # Watch mode
```

## Deployment

Spyglass can be deployed to cloud platforms like Railway. The simulator capture endpoint (`POST /api/asc/screenshots/capture`) requires macOS with Xcode CLI tools, so it won't work on Linux-based hosting.

Set `DISABLE_SIMULATOR=true` in your environment variables to gracefully disable the capture endpoint. Users can still capture screenshots locally on their Mac and upload them via drag-and-drop.

```bash
# Railway / Linux hosting
DISABLE_SIMULATOR=true
```

All other features — screenshot composition, metadata editing, App Store Connect uploads, batch export, and translation — work on any platform.

## Tech Stack

| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 7.1+ | Build tool |
| Tailwind CSS v4 | Styling |
| shadcn/ui | Component library |
| Canvas API | Screenshot rendering and composition |
| Hono | Backend server |
| SQLite | Database |
| Vitest | Testing |
| xAI Grok | AI metadata generation and background images |
| fflate | Zip compression for batch exports |
| App Store Connect API | Screenshot and metadata management |
| LibreTranslate | Marketing text translation |

## License

MIT License. See [LICENSE](LICENSE) for details.
