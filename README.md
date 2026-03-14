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

Spyglass is a web app for creating, translating, and managing App Store screenshots and metadata. Design marketing screenshots with device frames and text overlays, translate them into 28 languages, and push everything to App Store Connect.

Built on [Skateboard](https://github.com/stevederico/skateboard) with React 19, Hono, and Tailwind CSS v4.

## Features

**Studio** — Canvas-based screenshot composer
- Solid color, gradient, or image backgrounds
- Device frame overlays for 10 iPhone and iPad sizes
- Marketing text with customizable font, size, color, position, and shadow
- Batch translation into 28 App Store locales via LibreTranslate
- Export as PNG at exact App Store required dimensions

**Exports** — Screenshot and metadata management
- Screenshot grid filtered by app, language, and device type
- Drag-and-drop screenshot upload
- Metadata editor with character counts (name, subtitle, description, keywords, what's new)
- Push metadata directly to App Store Connect API

**Settings** — App Store Connect API integration
- JWT authentication with .p8 private key
- Connection status testing
- Credential management through the built-in Skateboard settings page

## Supported Devices

| Device | Resolution |
|---|---|
| iPhone 16 Pro Max (6.9") | 1320 x 2868 |
| iPhone 16 Plus (6.7") | 1290 x 2796 |
| iPhone 16 Pro (6.3") | 1206 x 2622 |
| iPhone 16 (6.1") | 1179 x 2556 |
| iPhone 8 Plus (5.5") | 1242 x 2208 |
| iPhone SE (4.7") | 750 x 1334 |
| iPad Pro 13" (M4) | 2064 x 2752 |
| iPad Pro 12.9" (6th gen) | 2048 x 2732 |
| iPad Air 11" (M3) | 1668 x 2388 |
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
| POST | `/api/asc/screenshots/capture` | Capture from iOS simulators (macOS only) |

### Translation

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/translate/text` | Translate single text |
| POST | `/api/translate/batch` | Translate to all locales |
| GET | `/api/translate/languages` | List available languages |

## Project Structure

```
spyglass/
├── src/
│   ├── components/
│   │   ├── StudioView.jsx        # Screenshot composer + localization
│   │   ├── ExportsView.jsx       # Screenshots + metadata management
│   │   ├── SettingsView.jsx      # ASC credentials (extends Skateboard settings)
│   │   └── composerHelpers.js    # Canvas drawing utilities
│   ├── main.jsx                  # Routes and app config
│   ├── constants.json            # App configuration
│   └── assets/styles.css         # Theme overrides
├── backend/
│   ├── server.js                 # Hono server
│   ├── asc.js                    # App Store Connect API routes
│   ├── translate.js              # LibreTranslate routes
│   └── adapters/                 # Database adapters
└── package.json
```

## Deployment

Spyglass can be deployed to cloud platforms like Railway. The simulator capture endpoint (`POST /api/asc/screenshots/capture`) requires macOS with Xcode CLI tools, so it won't work on Linux-based hosting.

Set `DISABLE_SIMULATOR=true` in your environment variables to gracefully disable the capture endpoint. Users can still capture screenshots locally on their Mac and upload them via drag-and-drop in the Exports view.

```bash
# Railway / Linux hosting
DISABLE_SIMULATOR=true
```

All other features — Studio composition, metadata editing, App Store Connect uploads, and batch translation — work on any platform.

## Tech Stack

| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 7.1+ | Build tool |
| Tailwind CSS v4 | Styling |
| shadcn/ui | Component library |
| Hono | Backend server |
| SQLite | Database |
| App Store Connect API | Screenshot and metadata management |
| LibreTranslate | Marketing text translation |

## License

MIT License. See [LICENSE](LICENSE) for details.
