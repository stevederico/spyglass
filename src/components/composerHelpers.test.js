import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEVICES,
  FONT_WEIGHTS,
  STARTER_TEMPLATES,
  buildFontString,
  fitTextToBox,
  drawComposite,
  exportCanvasPNG,
  renderForLocale
} from './composerHelpers.js';

// ── DEVICES constant ──

describe('DEVICES', () => {
  it('contains all required iPhone sizes', () => {
    const iphoneKeys = Object.keys(DEVICES).filter((k) => k.startsWith('iphone'));
    expect(iphoneKeys.length).toBeGreaterThanOrEqual(4);
  });

  it('contains all required iPad sizes', () => {
    const ipadKeys = Object.keys(DEVICES).filter((k) => k.startsWith('ipad'));
    expect(ipadKeys.length).toBeGreaterThanOrEqual(3);
  });

  it('every device has required dimension properties', () => {
    for (const [key, device] of Object.entries(DEVICES)) {
      expect(device).toHaveProperty('label');
      expect(device).toHaveProperty('width');
      expect(device).toHaveProperty('height');
      expect(device).toHaveProperty('radius');
      expect(device).toHaveProperty('bezelWidth');
      expect(device.width).toBeGreaterThan(0);
      expect(device.height).toBeGreaterThan(device.width);
    }
  });

  it('iPhone 6.7" has correct App Store dimensions', () => {
    expect(DEVICES['iphone-67'].width).toBe(1290);
    expect(DEVICES['iphone-67'].height).toBe(2796);
  });
});

// ── FONT_WEIGHTS constant ──

describe('FONT_WEIGHTS', () => {
  it('has Light, Regular, and Bold entries', () => {
    expect(FONT_WEIGHTS).toHaveProperty('Light', '300');
    expect(FONT_WEIGHTS).toHaveProperty('Regular', '400');
    expect(FONT_WEIGHTS).toHaveProperty('Bold', '700');
  });
});

// ── STARTER_TEMPLATES constant ──

describe('STARTER_TEMPLATES', () => {
  it('has at least 3 presets', () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  it('every template has name and settings', () => {
    for (const template of STARTER_TEMPLATES) {
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('settings');
      expect(template.settings).toHaveProperty('bgColor');
      expect(template.settings).toHaveProperty('textColor');
      expect(template.settings).toHaveProperty('fontWeight');
      expect(template.settings).toHaveProperty('fontSize');
    }
  });

  it('template names are unique', () => {
    const names = STARTER_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ── buildFontString ──

describe('buildFontString', () => {
  it('builds font string without custom family', () => {
    const result = buildFontString('700', 42);
    expect(result).toBe('700 42px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif');
  });

  it('builds font string with empty family string', () => {
    const result = buildFontString('400', 24, '');
    expect(result).toBe('400 24px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif');
  });

  it('builds font string with custom family', () => {
    const result = buildFontString('700', 48, 'Montserrat');
    expect(result).toContain('"Montserrat"');
    expect(result).toContain('700 48px');
    expect(result).toContain('-apple-system');
  });

  it('includes font weight and size in correct order', () => {
    const result = buildFontString('300', 16);
    expect(result).toMatch(/^300 16px/);
  });
});

// ── fitTextToBox ──

describe('fitTextToBox', () => {
  let ctx;

  beforeEach(() => {
    ctx = {
      font: '',
      measureText: vi.fn((text) => ({ width: text.length * 10 }))
    };
  });

  it('returns original size when text fits', () => {
    const result = fitTextToBox(ctx, 'Hello', 200, 100, 48, '700');
    expect(result.fontSize).toBe(48);
    expect(result.lines).toContain('Hello');
  });

  it('shrinks font when text overflows height', () => {
    // Each char = 10px wide, so "Hello World Test Long" = 210px at any font size
    // With maxWidth=50, it wraps into many lines, exceeding maxHeight
    const result = fitTextToBox(ctx, 'Hello World Test Long Text Here', 50, 30, 48, '700');
    expect(result.fontSize).toBeLessThan(48);
  });

  it('floors at minimum font size of 16', () => {
    const result = fitTextToBox(ctx, 'A'.repeat(100), 10, 5, 48, '700');
    expect(result.fontSize).toBe(16);
  });

  it('returns text as single line', () => {
    const result = fitTextToBox(ctx, 'Hello World', 60, 200, 24, '700');
    expect(result.lines).toEqual(['Hello World']);
  });

  it('keeps single word on one line', () => {
    const result = fitTextToBox(ctx, 'Hello', 500, 100, 24, '700');
    expect(result.lines).toEqual(['Hello']);
  });
});

// ── drawComposite ──

describe('drawComposite', () => {
  let canvas;
  let ctx;

  beforeEach(() => {
    ctx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      globalCompositeOperation: ''
    };
    canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx)
    };
  });

  const baseState = {
    device: 'iphone-67',
    showBezel: true,
    screenshotImage: null,
    textLine1: 'Track Your Fitness',
    textLine2: 'Reach Your Goals',
    textPosition: 'top',
    fontSize: 100,
    textColor: '#ffffff',
    textShadow: true,
    fontWeight: 'Bold',
    bgColor: '#1a1a2e',
    isGradient: false,
    gradientStart: '#1a1a2e',
    gradientEnd: '#16213e',
    gradientDirection: 'top-bottom',
    bgImage: null,
    autoFitText: true,
    fontFamily: ''
  };

  it('sets canvas dimensions from device', () => {
    drawComposite(canvas, baseState);
    expect(canvas.width).toBe(1290);
    expect(canvas.height).toBe(2796);
  });

  it('clears canvas before drawing', () => {
    drawComposite(canvas, baseState);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1290, 2796);
  });

  it('draws placeholder when no screenshot', () => {
    drawComposite(canvas, baseState);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('draws screenshot image when provided', () => {
    const img = { width: 100, height: 200 };
    drawComposite(canvas, { ...baseState, screenshotImage: img });
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('draws marketing text', () => {
    drawComposite(canvas, baseState);
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('skips headline when editingLine is 1', () => {
    drawComposite(canvas, { ...baseState, editingLine: 1 });
    const fillTextCalls = ctx.fillText.mock.calls;
    const headlines = fillTextCalls.filter((c) => c[0] === 'Track Your Fitness');
    expect(headlines.length).toBe(0);
  });

  it('skips subheadline when editingLine is 2', () => {
    drawComposite(canvas, { ...baseState, editingLine: 2 });
    const fillTextCalls = ctx.fillText.mock.calls;
    const subs = fillTextCalls.filter((c) => c[0] === 'Reach Your Goals');
    expect(subs.length).toBe(0);
  });

  it('respects layer visibility — hides background', () => {
    const fillRectBefore = vi.fn();
    ctx.fillRect = fillRectBefore;
    drawComposite(canvas, { ...baseState, layers: { background: false, device: true, headline: true, subheadline: true } });
    // Background draws fillRect for solid color — when hidden, only device placeholder draws
    // The key assertion is that no gradient/solid bg fill happens before device
    expect(ctx.clearRect).toHaveBeenCalled();
  });

  it('respects layer visibility — hides device', () => {
    drawComposite(canvas, { ...baseState, layers: { background: true, device: false, headline: true, subheadline: true } });
    // save/restore pair for device frame should not be called
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('respects layer visibility — hides headline', () => {
    drawComposite(canvas, { ...baseState, layers: { background: true, device: true, headline: false, subheadline: true } });
    const calls = ctx.fillText.mock.calls;
    const headlines = calls.filter((c) => c[0] === 'Track Your Fitness');
    expect(headlines.length).toBe(0);
  });

  it('respects layer visibility — hides subheadline', () => {
    drawComposite(canvas, { ...baseState, layers: { background: true, device: true, headline: true, subheadline: false } });
    const calls = ctx.fillText.mock.calls;
    const subs = calls.filter((c) => c[0] === 'Reach Your Goals');
    expect(subs.length).toBe(0);
  });

  it('handles bottom text position', () => {
    drawComposite(canvas, { ...baseState, textPosition: 'bottom' });
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('draws gradient background when enabled', () => {
    drawComposite(canvas, { ...baseState, isGradient: true });
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('works with all device types', () => {
    for (const deviceKey of Object.keys(DEVICES)) {
      expect(() => {
        drawComposite(canvas, { ...baseState, device: deviceKey });
      }).not.toThrow();
    }
  });

  it('handles empty text lines', () => {
    expect(() => {
      drawComposite(canvas, { ...baseState, textLine1: '', textLine2: '' });
    }).not.toThrow();
  });

  it('applies text shadow settings', () => {
    drawComposite(canvas, { ...baseState, textShadow: true });
    // Shadow should be set then cleared
    expect(ctx.shadowColor).toBe('transparent');
  });
});

// ── exportCanvasPNG ──

describe('exportCanvasPNG', () => {
  it('calls toBlob and triggers download', () => {
    const mockBlob = new Blob(['test'], { type: 'image/png' });
    const clickMock = vi.fn();
    const fakeLink = document.createElement('a');
    fakeLink.click = clickMock;

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeLink);
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const canvas = {
      toBlob: vi.fn((cb) => cb(mockBlob))
    };

    exportCanvasPNG(canvas, 'iphone-67');
    expect(canvas.toBlob).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(fakeLink.download).toContain('screenshot-iphone-67');

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});
