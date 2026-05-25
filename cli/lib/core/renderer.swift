// renderer.swift — Standalone CoreGraphics compositor for Spyglass CLI.
//
// Usage: swift renderer.swift <config.json> <output.png>
//
// Reads a JSON config describing background, device frame, screenshot, and
// marketing text layers, then renders the composite to a PNG file using
// CoreGraphics and CoreText. Coordinate system is flipped to top-left origin
// to match the browser-side Canvas 2D layout math.

import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

// MARK: - Config Model

struct FrameModelInfo: Decodable {
    let screenWidth: CGFloat
    let screenHeight: CGFloat
    let frameWidth: CGFloat
    let frameHeight: CGFloat
}

struct LayerVisibility: Decodable {
    var background: Bool?
    var device: Bool?
    var headline: Bool?
    var subheadline: Bool?

    init() {
        background = true
        device = true
        headline = true
        subheadline = true
    }
}

struct Config: Decodable {
    let width: Int
    let height: Int
    var device: String?
    var bgColor: String?
    var isGradient: Bool?
    var gradientStart: String?
    var gradientEnd: String?
    var gradientDirection: String?
    var textColor: String?
    var textShadow: CGFloat?
    var fontWeight: String?
    var fontSize: CGFloat?
    var textPosition: String?
    var textLine1: String?
    var textLine2: String?
    var screenshotPath: String?
    var framePath: String?
    var frameLayout: String?
    var showBezel: Bool?
    var orientation: String?
    var deviceRadius: CGFloat?
    var deviceBezelWidth: CGFloat?
    var frameModelInfo: FrameModelInfo?
    var autoFitText: Bool?
    var fontFamily: String?
    var layers: LayerVisibility?
    var bgImagePath: String?
    var registeredFonts: [String: String]?
}

// MARK: - Color Parsing

/// Parse a hex color string (#RRGGBB or #RRGGBBAA) into a CGColor.
func parseHexColor(_ hex: String) -> CGColor {
    var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if h.hasPrefix("#") { h = String(h.dropFirst()) }
    guard h.count >= 6 else {
        return CGColor(red: 0, green: 0, blue: 0, alpha: 1)
    }
    let scanner = Scanner(string: h)
    var rgb: UInt64 = 0
    scanner.scanHexInt64(&rgb)
    let r = CGFloat((rgb >> 16) & 0xFF) / 255.0
    let g = CGFloat((rgb >> 8) & 0xFF) / 255.0
    let b = CGFloat(rgb & 0xFF) / 255.0
    let a: CGFloat = h.count >= 8 ? CGFloat((rgb >> 24) & 0xFF) / 255.0 : 1.0
    return CGColor(red: r, green: g, blue: b, alpha: a)
}

// MARK: - Image Loading

/// Load a CGImage from a file path.
func loadCGImage(at path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          CGImageSourceGetCount(source) > 0 else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

// MARK: - PNG Writing

/// Write a CGImage to a PNG file at the given path.
func writePNG(_ image: CGImage, to path: String) -> Bool {
    let url = URL(fileURLWithPath: path)
    let utType = UTType.png
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, utType.identifier as CFString, 1, nil) else {
        return false
    }
    CGImageDestinationAddImage(dest, image, nil)
    return CGImageDestinationFinalize(dest)
}

// MARK: - Rounded Rect Path

/// Create a rounded rectangle CGPath.
func roundedRectPath(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, r: CGFloat) -> CGPath {
    let radius = min(r, w / 2, h / 2)
    let path = CGMutablePath()
    path.move(to: CGPoint(x: x + radius, y: y))
    path.addLine(to: CGPoint(x: x + w - radius, y: y))
    path.addQuadCurve(to: CGPoint(x: x + w, y: y + radius), control: CGPoint(x: x + w, y: y))
    path.addLine(to: CGPoint(x: x + w, y: y + h - radius))
    path.addQuadCurve(to: CGPoint(x: x + w - radius, y: y + h), control: CGPoint(x: x + w, y: y + h))
    path.addLine(to: CGPoint(x: x + radius, y: y + h))
    path.addQuadCurve(to: CGPoint(x: x, y: y + h - radius), control: CGPoint(x: x, y: y + h))
    path.addLine(to: CGPoint(x: x, y: y + radius))
    path.addQuadCurve(to: CGPoint(x: x + radius, y: y), control: CGPoint(x: x, y: y))
    path.closeSubpath()
    return path
}

// MARK: - Text Rendering

/// Resolve a CTFont from the config's fontFamily and weight.
func resolveFont(family: String?, weight: String?, size: CGFloat) -> CTFont {
    let weightValue: CGFloat
    switch weight {
    case "300": weightValue = -0.4
    case "400": weightValue = 0.0
    case "700": weightValue = 0.4
    default: weightValue = 0.4
    }

    if let family = family, !family.isEmpty {
        let attrs: [String: Any] = [
            kCTFontFamilyNameAttribute as String: family,
            kCTFontTraitsAttribute as String: [
                kCTFontWeightTrait as String: weightValue
            ]
        ]
        let descriptor = CTFontDescriptorCreateWithAttributes(attrs as CFDictionary)
        return CTFontCreateWithFontDescriptor(descriptor, size, nil)
    }

    // Default to SF Pro Display or system font
    let sfNames = ["SF Pro Display", "SFProDisplay", ".SF Pro Display"]
    for name in sfNames {
        let attrs: [String: Any] = [
            kCTFontFamilyNameAttribute as String: name,
            kCTFontTraitsAttribute as String: [
                kCTFontWeightTrait as String: weightValue
            ]
        ]
        let descriptor = CTFontDescriptorCreateWithAttributes(attrs as CFDictionary)
        let font = CTFontCreateWithFontDescriptor(descriptor, size, nil)
        let resolvedFamily = CTFontCopyFamilyName(font) as String
        if resolvedFamily.lowercased().contains("sf") || resolvedFamily.lowercased().contains("san francisco") {
            return font
        }
    }

    // Fallback to system font
    return CTFontCreateWithName("Helvetica Neue" as CFString, size, nil)
}

/// Word-wrap text and return lines that fit within maxWidth.
func wrapText(_ text: String, font: CTFont, maxWidth: CGFloat) -> [String] {
    let words = text.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
    var lines: [String] = []
    var currentLine = ""

    for word in words {
        let testLine = currentLine.isEmpty ? word : currentLine + " " + word
        let testWidth = measureTextWidth(testLine, font: font)
        if testWidth > maxWidth && !currentLine.isEmpty {
            lines.append(currentLine)
            currentLine = word
        } else {
            currentLine = testLine
        }
    }
    if !currentLine.isEmpty {
        lines.append(currentLine)
    }
    return lines
}

/// Measure the width of a single line of text.
func measureTextWidth(_ text: String, font: CTFont) -> CGFloat {
    let attrs: [String: Any] = [kCTFontAttributeName as String: font]
    let attrStr = CFAttributedStringCreate(nil, text as CFString, attrs as CFDictionary)!
    let line = CTLineCreateWithAttributedString(attrStr)
    let bounds = CTLineGetBoundsWithOptions(line, [])
    return bounds.width
}

/// Fit text into a box by reducing font size until it fits.
func fitTextToBox(text: String, family: String?, weight: String?, maxWidth: CGFloat, maxHeight: CGFloat, initialSize: CGFloat) -> (fontSize: CGFloat, lines: [String]) {
    let minSize: CGFloat = 16
    var size = initialSize

    while size > minSize {
        let font = resolveFont(family: family, weight: weight, size: size)
        let lines = wrapText(text, font: font, maxWidth: maxWidth)
        let totalHeight = CGFloat(lines.count) * size * 1.3
        if totalHeight <= maxHeight {
            return (size, lines)
        }
        size -= 2
    }

    let font = resolveFont(family: family, weight: weight, size: minSize)
    let lines = wrapText(text, font: font, maxWidth: maxWidth)
    return (minSize, lines)
}

/// Draw centered, word-wrapped text with optional shadow.
/// The context is assumed to be flipped (top-left origin).
func drawText(_ ctx: CGContext, text: String, centerX: CGFloat, y: CGFloat,
              maxWidth: CGFloat, fontSize: CGFloat, color: CGColor,
              shadowBlur: CGFloat, fontWeight: String?, fontFamily: String?,
              autoFitMaxHeight: CGFloat?) {

    guard !text.isEmpty else { return }

    let weight = fontWeight ?? "700"
    var effectiveSize = fontSize
    var lines: [String]

    if let maxH = autoFitMaxHeight, maxH > 0 {
        let result = fitTextToBox(text: text, family: fontFamily, weight: weight,
                                  maxWidth: maxWidth, maxHeight: maxH, initialSize: fontSize)
        effectiveSize = result.fontSize
        lines = result.lines
    } else {
        let font = resolveFont(family: fontFamily, weight: weight, size: effectiveSize)
        lines = wrapText(text, font: font, maxWidth: maxWidth)
    }

    let font = resolveFont(family: fontFamily, weight: weight, size: effectiveSize)

    if shadowBlur > 0 {
        let shadowColor = CGColor(red: 0, green: 0, blue: 0, alpha: 0.5)
        ctx.setShadow(offset: CGSize(width: 0, height: round(shadowBlur / 2)),
                      blur: shadowBlur, color: shadowColor)
    }

    let attrs: [String: Any] = [
        kCTFontAttributeName as String: font,
        kCTForegroundColorAttributeName as String: color
    ]

    var lineY = y
    for line in lines {
        let attrStr = CFAttributedStringCreate(nil, line as CFString, attrs as CFDictionary)!
        let ctLine = CTLineCreateWithAttributedString(attrStr)
        let lineBounds = CTLineGetBoundsWithOptions(ctLine, [])
        let lineX = centerX - lineBounds.width / 2

        // CoreText draws in native CG coords (y-up). Since we flipped
        // the context globally, we must un-flip locally for each line.
        ctx.saveGState()
        ctx.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
        ctx.textPosition = CGPoint(x: lineX, y: lineY)
        CTLineDraw(ctLine, ctx)
        ctx.restoreGState()

        lineY += effectiveSize * 1.3
    }

    if shadowBlur > 0 {
        ctx.setShadow(offset: .zero, blur: 0, color: nil)
    }
}

// MARK: - Background Drawing

/// Draw the background layer (solid, gradient, or image).
func drawBackground(_ ctx: CGContext, width: Int, height: Int, config: Config) {
    let w = CGFloat(width)
    let h = CGFloat(height)

    // Background image
    if let bgPath = config.bgImagePath, !bgPath.isEmpty, let bgImg = loadCGImage(at: bgPath) {
        let imgW = CGFloat(bgImg.width)
        let imgH = CGFloat(bgImg.height)
        let imgRatio = imgW / imgH
        let canvasRatio = w / h
        var sx: CGFloat = 0, sy: CGFloat = 0, sw = imgW, sh = imgH
        if imgRatio > canvasRatio {
            sw = imgH * canvasRatio
            sx = (imgW - sw) / 2
        } else {
            sh = imgW / canvasRatio
            sy = (imgH - sh) / 2
        }
        let cropRect = CGRect(x: sx, y: sy, width: sw, height: sh)
        if let cropped = bgImg.cropping(to: cropRect) {
            ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: w, height: h))
        }
        return
    }

    if config.isGradient == true {
        let startColor = parseHexColor(config.gradientStart ?? "#000000")
        let endColor = parseHexColor(config.gradientEnd ?? "#000000")
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let gradient = CGGradient(colorsSpace: colorSpace,
                                         colors: [startColor, endColor] as CFArray,
                                         locations: [0.0, 1.0]) else { return }

        let direction = config.gradientDirection ?? "top-bottom"
        let startPoint = CGPoint(x: 0, y: 0)
        var endPoint = CGPoint(x: 0, y: h)
        if direction == "left-right" {
            endPoint = CGPoint(x: w, y: 0)
        } else if direction == "diagonal" {
            endPoint = CGPoint(x: w, y: h)
        }

        ctx.drawLinearGradient(gradient, start: startPoint, end: endPoint, options: [])
    } else {
        let color = parseHexColor(config.bgColor ?? "#000000")
        ctx.setFillColor(color)
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    }
}

// MARK: - Main Render

func render(config: Config, outputPath: String) -> Bool {
    let cw = config.width
    let ch = config.height

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(data: nil, width: cw, height: ch,
                              bitsPerComponent: 8, bytesPerRow: 0,
                              space: colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        fputs("Error: Failed to create bitmap context\n", stderr)
        return false
    }

    let w = CGFloat(cw)
    let h = CGFloat(ch)

    // Flip to top-left origin to match Canvas 2D coordinate system
    ctx.translateBy(x: 0, y: h)
    ctx.scaleBy(x: 1, y: -1)

    let vis = config.layers ?? LayerVisibility()

    // --- Background ---
    if vis.background != false {
        // Save/restore because gradient drawing doesn't respect transforms the same way
        ctx.saveGState()
        drawBackground(ctx, width: cw, height: ch, config: config)
        ctx.restoreGState()
    }

    // --- Layout math (identical to composerHelpers.js) ---
    let layout = config.frameLayout ?? "full"
    let isFullscreen = layout == "fullscreen"
    let isZoomed = layout == "zoomed"
    let isTop = (config.textPosition ?? "top") == "top"

    let scaledFont = (config.fontSize ?? 100) * (w / 1290)

    let hasHeadline = vis.headline != false && !(config.textLine1 ?? "").isEmpty
    let hasSubtitle = vis.subheadline != false && !(config.textLine2 ?? "").isEmpty

    let textContentHeight: CGFloat
    if hasSubtitle {
        textContentHeight = scaledFont * 1.2 + scaledFont * 0.2 + scaledFont * 0.75 * 1.2
    } else if hasHeadline {
        textContentHeight = scaledFont * 1.2
    } else {
        textContentHeight = 0
    }

    let textMargin = scaledFont * 1.4
    let textAreaHeight = isFullscreen ? 0 : textContentHeight + textMargin * 2

    let headlineBaselineY = textMargin + scaledFont * 0.8
    let subtitleBaselineY = headlineBaselineY + scaledFont * 1.4

    let devW = w
    let devH = h

    let deviceRadius = config.deviceRadius ?? 125
    let deviceBezelWidth = config.deviceBezelWidth ?? 18

    var screenScale: CGFloat
    var frameX: CGFloat
    var frameY: CGFloat
    var frameW: CGFloat
    var frameH: CGFloat

    if isFullscreen {
        screenScale = 1
        frameX = 0
        frameY = 0
        frameW = w
        frameH = h
    } else if isZoomed {
        screenScale = (w * 0.90) / devW
        frameW = devW * screenScale
        frameH = devH * screenScale
        frameX = (w - frameW) / 2
        frameY = isTop ? textAreaHeight : scaledFont * 0.5
    } else {
        frameY = isTop ? textAreaHeight : scaledFont * 0.5
        let availableHeight = h - textAreaHeight - scaledFont * 0.5
        screenScale = min((w * 0.75) / devW, availableHeight / devH)
        frameW = devW * screenScale
        frameH = devH * screenScale
        frameX = (w - frameW) / 2
    }

    let scaledRadius = deviceRadius * screenScale
    let scaledBezel = deviceBezelWidth * screenScale

    // --- Device / Screenshot ---
    if vis.device != false {
        let screenshotImage: CGImage? = {
            if let p = config.screenshotPath, !p.isEmpty { return loadCGImage(at: p) }
            return nil
        }()

        if isFullscreen {
            if let img = screenshotImage {
                ctx.saveGState()
                ctx.translateBy(x: 0, y: h)
                ctx.scaleBy(x: 1, y: -1)
                ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
                ctx.restoreGState()
            } else {
                ctx.setFillColor(parseHexColor("#2a2a3e"))
                ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            }
        } else {
            let hasFramePNG: Bool = {
                if let fp = config.framePath, !fp.isEmpty, config.frameModelInfo != nil {
                    return true
                }
                return false
            }()

            if hasFramePNG, let model = config.frameModelInfo {
                let mScreenW = model.screenWidth
                let mScreenH = model.screenHeight
                let mFrameW = model.frameWidth
                let mFrameH = model.frameHeight
                let screenInsetX = (mFrameW - mScreenW) / 2
                let screenInsetY = (mFrameH - mScreenH) / 2
                let pngScale = frameW / mScreenW

                // Draw screenshot clipped to rounded rect
                ctx.saveGState()
                let clipPath = roundedRectPath(x: frameX, y: frameY, w: frameW, h: frameH, r: scaledRadius)
                ctx.addPath(clipPath)
                ctx.clip()
                if let img = screenshotImage {
                    ctx.saveGState()
                    ctx.translateBy(x: frameX, y: frameY + frameH)
                    ctx.scaleBy(x: 1, y: -1)
                    ctx.draw(img, in: CGRect(x: 0, y: 0, width: frameW, height: frameH))
                    ctx.restoreGState()
                } else {
                    ctx.setFillColor(parseHexColor("#2a2a3e"))
                    ctx.fill(CGRect(x: frameX, y: frameY, width: frameW, height: frameH))
                }
                ctx.restoreGState()

                // Draw frame PNG overlay
                if let frameImg = loadCGImage(at: config.framePath!) {
                    let framePngX = frameX - screenInsetX * pngScale
                    let framePngY = frameY - screenInsetY * pngScale
                    let framePngW = mFrameW * pngScale
                    let framePngH = mFrameH * pngScale
                    ctx.saveGState()
                    ctx.translateBy(x: framePngX, y: framePngY + framePngH)
                    ctx.scaleBy(x: 1, y: -1)
                    ctx.draw(frameImg, in: CGRect(x: 0, y: 0, width: framePngW, height: framePngH))
                    ctx.restoreGState()
                }
            } else {
                ctx.saveGState()

                if config.showBezel == true {
                    // Draw bezel (dark outer rounded rect)
                    let bezelPath = roundedRectPath(x: frameX - scaledBezel, y: frameY - scaledBezel,
                                                     w: frameW + scaledBezel * 2, h: frameH + scaledBezel * 2,
                                                     r: scaledRadius + scaledBezel)
                    ctx.setFillColor(parseHexColor("#1a1a1a"))
                    ctx.addPath(bezelPath)
                    ctx.fillPath()

                    // Clip to inner screen area
                    let screenPath = roundedRectPath(x: frameX, y: frameY, w: frameW, h: frameH, r: scaledRadius)
                    ctx.addPath(screenPath)
                    ctx.clip()
                } else {
                    let screenPath = roundedRectPath(x: frameX, y: frameY, w: frameW, h: frameH, r: scaledRadius)
                    ctx.addPath(screenPath)
                    ctx.clip()
                }

                if let img = screenshotImage {
                    ctx.saveGState()
                    ctx.translateBy(x: frameX, y: frameY + frameH)
                    ctx.scaleBy(x: 1, y: -1)
                    ctx.draw(img, in: CGRect(x: 0, y: 0, width: frameW, height: frameH))
                    ctx.restoreGState()
                } else {
                    ctx.setFillColor(parseHexColor("#2a2a3e"))
                    ctx.fill(CGRect(x: frameX, y: frameY, width: frameW, height: frameH))
                }
                ctx.restoreGState()
            }
        }
    }

    // --- Text ---
    if !isFullscreen {
        let textMaxWidth = w * 0.8
        let fontWeightMap = ["Light": "300", "Regular": "400", "Bold": "700"]
        let weightValue = fontWeightMap[config.fontWeight ?? "Bold"] ?? "700"
        let autoFitMaxHeight: CGFloat? = (config.autoFitText != false) ? textAreaHeight : nil
        let fontFamily = config.fontFamily
        let textColor = parseHexColor(config.textColor ?? "#ffffff")
        let shadowBlur = config.textShadow ?? 0

        let showHeadline = vis.headline != false
        let showSubheadline = vis.subheadline != false

        // CoreText draws text at the baseline in the flipped context.
        // The y values from the JS layout are baseline positions measured from the top.
        if isTop {
            if showHeadline, let line1 = config.textLine1, !line1.isEmpty {
                drawText(ctx, text: line1, centerX: w / 2, y: headlineBaselineY,
                         maxWidth: textMaxWidth, fontSize: scaledFont, color: textColor,
                         shadowBlur: shadowBlur, fontWeight: weightValue, fontFamily: fontFamily,
                         autoFitMaxHeight: autoFitMaxHeight)
            }
            if let line2 = config.textLine2, !line2.isEmpty, showSubheadline {
                drawText(ctx, text: line2, centerX: w / 2, y: subtitleBaselineY,
                         maxWidth: textMaxWidth, fontSize: scaledFont * 0.75, color: textColor,
                         shadowBlur: shadowBlur, fontWeight: weightValue, fontFamily: fontFamily,
                         autoFitMaxHeight: autoFitMaxHeight)
            }
        } else {
            let textDeviceGap = scaledFont * 0.5
            let bottomTextY1 = frameY + frameH + textDeviceGap + scaledFont * 0.8
            if showHeadline, let line1 = config.textLine1, !line1.isEmpty {
                drawText(ctx, text: line1, centerX: w / 2, y: bottomTextY1,
                         maxWidth: textMaxWidth, fontSize: scaledFont, color: textColor,
                         shadowBlur: shadowBlur, fontWeight: weightValue, fontFamily: fontFamily,
                         autoFitMaxHeight: autoFitMaxHeight)
            }
            if let line2 = config.textLine2, !line2.isEmpty, showSubheadline {
                drawText(ctx, text: line2, centerX: w / 2, y: bottomTextY1 + scaledFont * 1.4,
                         maxWidth: textMaxWidth, fontSize: scaledFont * 0.75, color: textColor,
                         shadowBlur: shadowBlur, fontWeight: weightValue, fontFamily: fontFamily,
                         autoFitMaxHeight: autoFitMaxHeight)
            }
        }
    }

    // --- Output ---
    guard let image = ctx.makeImage() else {
        fputs("Error: Failed to create CGImage from context\n", stderr)
        return false
    }

    return writePNG(image, to: outputPath)
}

// MARK: - Font Registration

/// Register custom fonts from the config's registeredFonts map.
func registerFonts(_ fonts: [String: String]?) {
    guard let fonts = fonts else { return }
    for (_, fontPath) in fonts {
        let url = URL(fileURLWithPath: fontPath) as CFURL
        CTFontManagerRegisterFontsForURL(url, .process, nil)
    }
}

// MARK: - Entry Point

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: swift renderer.swift <config.json> <output.png>\n", stderr)
    exit(1)
}

let configPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

guard let data = FileManager.default.contents(atPath: configPath) else {
    fputs("Error: Cannot read config file: \(configPath)\n", stderr)
    exit(1)
}

let decoder = JSONDecoder()
guard let config = try? decoder.decode(Config.self, from: data) else {
    fputs("Error: Failed to parse config JSON\n", stderr)
    exit(1)
}

registerFonts(config.registeredFonts)

if render(config: config, outputPath: outputPath) {
    // Success — no output on stdout
    exit(0)
} else {
    fputs("Error: Failed to write output PNG\n", stderr)
    exit(1)
}
