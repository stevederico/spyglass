# Spyglass — Todo

## Screenshot Composer
Build canvas-based screenshot composer (background + device frame + marketing text overlay)
Support background options: solid color, gradient, image upload
Device frame overlays for all modern sizes (6.7", 6.5", 5.5", 12.9" iPad)
Marketing text overlay with customizable position (top/bottom), font, size, color, shadow
Auto-sizing font system that shrinks text to fit within bounds
Live preview in browser before export
Export as PNG at exact App Store required dimensions

## Localization Engine
Auto-translate marketing text to all 28+ App Store Connect locales (LibreTranslate)
Apple locale code mapping (e.g., cmn-Hans → zh-CN, cmn-Hant → zh-TW)
Manual override for any translated string
Language fallback groups (en-AU, en-CA, en-GB share en-US text)
Preview translations before batch export
Connect localization output to composer for batch export

## Template System
Save/load layout presets (background + font + text position + style)
Built-in starter templates (minimal, bold, gradient)
Custom font support (upload TTF/OTF)
Per-app template assignment
Duplicate and modify existing templates

## Batch Export
Generate all device sizes x all languages in one click
ASC-ready file naming convention ({language}-screenshot-{position}-{size})
Progress bar with per-image status
Export to .itmsp package structure
Zip download of full export bundle

## Screenshot Capture Improvements
Auto-detect installed simulators and available devices
Capture multiple screens in sequence (UI test driven)
Name screenshots by screen/flow (e.g., "onboarding-1", "home", "settings")
Auto-crop status bar option

## Metadata Enhancements
Localized metadata editing (per-language name, subtitle, description, keywords)
Auto-translate metadata fields with manual override
Keyword character count per locale (different limits per language)
SEO/ASO keyword suggestions
Diff view showing changes before pushing to ASC
Version history / rollback

## Quality of Life
Drag-and-drop screenshot reordering across device sizes
Bulk delete screenshots
Side-by-side preview of all device sizes
Dark/light mode preview toggle for screenshots
Undo/redo for composer edits
