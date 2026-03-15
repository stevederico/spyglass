# Spyglass CLI

Command-line tool for automating iOS App Store screenshot workflows. Spyglass scans your Xcode project, captures simulator screenshots, composites them with device frames and text overlays, generates localized metadata with AI, and packages everything for App Store Connect upload.

## Installation

```bash
cd cli
npm install
npm link
```

## Quick Start

```bash
# 1. Scaffold a config file in your project
spyglass init --path ./MyApp

# 2. Extract metadata from the Xcode project
spyglass scan --path ./MyApp.xcodeproj

# 3. Capture screenshots on simulators
spyglass capture --bundle-id com.example.app --devices "iPhone 16 Pro Max"

# 4. Compose App Store composites
spyglass compose --screenshots ./captures --template default --locales en,ja

# 5. Export for upload
spyglass export --input ./composites --output ./dist --format asc

# 6. Upload to App Store Connect
spyglass upload --input ./dist --app-id 1234567890
```

## Command Reference

### `spyglass init`

Scaffold a `spyglass.config.json` in the target directory.

```bash
spyglass init [--path <dir>]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--path` | Directory to create config in | `.` |

### `spyglass scan`

Extract metadata (bundle ID, display name, schemes) from an Xcode project.

```bash
spyglass scan --path <xcodeproj>
```

| Flag | Description | Required |
|------|-------------|----------|
| `--path` | Path to `.xcodeproj` | Yes |

### `spyglass capture`

Run the app on iOS simulators and take screenshots of specified screens.

```bash
spyglass capture --bundle-id <id> [--devices <list>] [--screens <names>] [--crop-status-bar]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--bundle-id` | App bundle identifier | Required |
| `--devices` | Comma-separated simulator names | All configured |
| `--screens` | Comma-separated screen names | All screens |
| `--crop-status-bar` | Remove status bar from captures | `false` |

### `spyglass compose`

Render App Store composites by combining screenshots with device frames and text.

```bash
spyglass compose [--screenshots <dir>] [--template <name>] [--locales <list>] [--devices <list>] [--output <dir>]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--screenshots` | Directory containing captures | `./captures` |
| `--template` | Template name | `default` |
| `--locales` | Comma-separated locale codes | `en` |
| `--devices` | Comma-separated device names | All |
| `--output` | Output directory | `./composites` |

### `spyglass metadata`

Generate or translate App Store metadata using AI.

```bash
spyglass metadata --path <xcodeproj> [--fields <list>] [--tone <tone>] [--locales <list>]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--path` | Path to `.xcodeproj` | Required |
| `--fields` | Comma-separated fields (title, subtitle, description, keywords) | All |
| `--tone` | Writing tone (professional, casual, playful) | `professional` |
| `--locales` | Comma-separated locale codes to translate into | `en` |

### `spyglass export`

Package composites into the format expected by App Store Connect or as a zip archive.

```bash
spyglass export [--input <dir>] [--output <dir>] [--format asc|zip]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--input` | Composites directory | `./composites` |
| `--output` | Output directory | `./dist` |
| `--format` | Export format (`asc` or `zip`) | `asc` |

### `spyglass upload`

Upload packaged screenshots to App Store Connect via the API.

```bash
spyglass upload --input <dir> --app-id <id>
```

| Flag | Description | Required |
|------|-------------|----------|
| `--input` | Directory with exported screenshots | Yes |
| `--app-id` | App Store Connect app ID | Yes |

## Configuration

Spyglass reads from `spyglass.config.json` in the project root:

```json
{
  "bundleId": "com.example.app",
  "devices": [
    "iPhone 16 Pro Max",
    "iPhone 16",
    "iPad Pro 13-inch (M4)"
  ],
  "screens": [
    { "name": "Home", "route": "/" },
    { "name": "Detail", "route": "/detail/1" }
  ],
  "locales": ["en", "ja", "de", "fr", "es"],
  "template": "default",
  "metadata": {
    "tone": "professional",
    "fields": ["title", "subtitle", "description", "keywords"]
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `XAI_API_KEY` | xAI / Grok API key for AI metadata generation |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_PRIVATE_KEY_PATH` | Path to App Store Connect `.p8` private key |
| `LIBRETRANSLATE_URL` | LibreTranslate instance URL for locale translation |

## Dependencies

Spyglass CLI ships with only 3 runtime dependencies:

- **@napi-rs/canvas** — High-performance image compositing via native Canvas bindings
- **jsonwebtoken** — JWT signing for App Store Connect API authentication
- **fflate** — Lightweight zip compression for export packaging
