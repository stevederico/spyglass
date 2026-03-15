/**
 * Device frame manifest mapping models to colors, dimensions, and ASC tiers
 *
 * Each entry defines the frame PNG dimensions, the screen area within it,
 * and the App Store Connect screenshot tier it maps to. Colors reference
 * PNG files in public/frames/{modelSlug}/{colorSlug}-portrait.png.
 *
 * @module frameManifest
 */

/** @type {Object.<string, { label: string, group: string, frameWidth: number, frameHeight: number, screenWidth: number, screenHeight: number, ascTier: string, colors: Array<{ slug: string, label: string }>, defaultColor: string }>} */
export const FRAME_MODELS = {
  'iphone-16': {
    label: 'iPhone 16',
    group: 'iPhone',
    frameWidth: 1359,
    frameHeight: 2736,
    screenWidth: 1179,
    screenHeight: 2556,
    ascTier: 'iphone-61',
    colors: [
      { slug: 'black', label: 'Black' },
      { slug: 'pink', label: 'Pink' },
      { slug: 'teal', label: 'Teal' },
      { slug: 'ultramarine', label: 'Ultramarine' },
      { slug: 'white', label: 'White' }
    ],
    defaultColor: 'black'
  },
  'iphone-16-plus': {
    label: 'iPhone 16 Plus',
    group: 'iPhone',
    frameWidth: 1470,
    frameHeight: 2970,
    screenWidth: 1290,
    screenHeight: 2796,
    ascTier: 'iphone-67',
    colors: [
      { slug: 'black', label: 'Black' },
      { slug: 'pink', label: 'Pink' },
      { slug: 'teal', label: 'Teal' },
      { slug: 'ultramarine', label: 'Ultramarine' },
      { slug: 'white', label: 'White' }
    ],
    defaultColor: 'black'
  },
  'iphone-16-pro': {
    label: 'iPhone 16 Pro',
    group: 'iPhone',
    frameWidth: 1350,
    frameHeight: 2760,
    screenWidth: 1206,
    screenHeight: 2622,
    ascTier: 'iphone-65',
    colors: [
      { slug: 'black-titanium', label: 'Black Titanium' },
      { slug: 'desert-titanium', label: 'Desert Titanium' },
      { slug: 'natural-titanium', label: 'Natural Titanium' },
      { slug: 'white-titanium', label: 'White Titanium' }
    ],
    defaultColor: 'black-titanium'
  },
  'iphone-16-pro-max': {
    label: 'iPhone 16 Pro Max',
    group: 'iPhone',
    frameWidth: 1470,
    frameHeight: 3000,
    screenWidth: 1320,
    screenHeight: 2868,
    ascTier: 'iphone-69',
    colors: [
      { slug: 'black-titanium', label: 'Black Titanium' },
      { slug: 'desert-titanium', label: 'Desert Titanium' },
      { slug: 'natural-titanium', label: 'Natural Titanium' },
      { slug: 'white-titanium', label: 'White Titanium' }
    ],
    defaultColor: 'black-titanium'
  },
  'iphone-17': {
    label: 'iPhone 17',
    group: 'iPhone',
    frameWidth: 1350,
    frameHeight: 2760,
    screenWidth: 1206,
    screenHeight: 2622,
    ascTier: 'iphone-65',
    colors: [
      { slug: 'black', label: 'Black' },
      { slug: 'lavender', label: 'Lavender' },
      { slug: 'mist-blue', label: 'Mist Blue' },
      { slug: 'sage', label: 'Sage' },
      { slug: 'white', label: 'White' }
    ],
    defaultColor: 'black'
  },
  'iphone-17-pro': {
    label: 'iPhone 17 Pro',
    group: 'iPhone',
    frameWidth: 1350,
    frameHeight: 2760,
    screenWidth: 1206,
    screenHeight: 2622,
    ascTier: 'iphone-65',
    colors: [
      { slug: 'cosmic-orange', label: 'Cosmic Orange' },
      { slug: 'deep-blue', label: 'Deep Blue' },
      { slug: 'silver', label: 'Silver' }
    ],
    defaultColor: 'silver'
  },
  'iphone-17-pro-max': {
    label: 'iPhone 17 Pro Max',
    group: 'iPhone',
    frameWidth: 1470,
    frameHeight: 3000,
    screenWidth: 1320,
    screenHeight: 2868,
    ascTier: 'iphone-69',
    colors: [
      { slug: 'cosmic-orange', label: 'Cosmic Orange' },
      { slug: 'deep-blue', label: 'Deep Blue' },
      { slug: 'silver', label: 'Silver' }
    ],
    defaultColor: 'silver'
  },
  'iphone-air': {
    label: 'iPhone Air',
    group: 'iPhone',
    frameWidth: 1380,
    frameHeight: 2880,
    screenWidth: 1206,
    screenHeight: 2622,
    ascTier: 'iphone-65',
    colors: [
      { slug: 'cloud-white', label: 'Cloud White' },
      { slug: 'light-gold', label: 'Light Gold' },
      { slug: 'sky-blue', label: 'Sky Blue' },
      { slug: 'space-black', label: 'Space Black' }
    ],
    defaultColor: 'space-black'
  },
  'ipad-silver': {
    label: 'iPad',
    group: 'iPad',
    frameWidth: 1840,
    frameHeight: 2660,
    screenWidth: 1668,
    screenHeight: 2388,
    ascTier: 'ipad-11',
    colors: [
      { slug: 'silver', label: 'Silver' }
    ],
    defaultColor: 'silver'
  },
  'ipad-mini': {
    label: 'iPad mini',
    group: 'iPad',
    frameWidth: 1780,
    frameHeight: 2550,
    screenWidth: 1668,
    screenHeight: 2224,
    ascTier: 'ipad-105',
    colors: [
      { slug: 'starlight', label: 'Starlight' }
    ],
    defaultColor: 'starlight'
  },
  'ipad-air-11-m2': {
    label: 'iPad Air 11"',
    group: 'iPad',
    frameWidth: 1900,
    frameHeight: 2620,
    screenWidth: 1668,
    screenHeight: 2388,
    ascTier: 'ipad-11',
    colors: [
      { slug: 'blue', label: 'Blue' },
      { slug: 'purple', label: 'Purple' },
      { slug: 'space-gray', label: 'Space Gray' },
      { slug: 'stardust', label: 'Stardust' }
    ],
    defaultColor: 'space-gray'
  },
  'ipad-air-13-m2': {
    label: 'iPad Air 13"',
    group: 'iPad',
    frameWidth: 2300,
    frameHeight: 2980,
    screenWidth: 2048,
    screenHeight: 2732,
    ascTier: 'ipad-129',
    colors: [
      { slug: 'blue', label: 'Blue' },
      { slug: 'purple', label: 'Purple' },
      { slug: 'space-gray', label: 'Space Gray' },
      { slug: 'stardust', label: 'Stardust' }
    ],
    defaultColor: 'space-gray'
  },
  'ipad-pro-11-m4': {
    label: 'iPad Pro 11"',
    group: 'iPad',
    frameWidth: 1880,
    frameHeight: 2640,
    screenWidth: 1668,
    screenHeight: 2388,
    ascTier: 'ipad-11',
    colors: [
      { slug: 'silver', label: 'Silver' },
      { slug: 'space-gray', label: 'Space Gray' }
    ],
    defaultColor: 'silver'
  },
  'ipad-pro-13-m4': {
    label: 'iPad Pro 13"',
    group: 'iPad',
    frameWidth: 2300,
    frameHeight: 3000,
    screenWidth: 2064,
    screenHeight: 2752,
    ascTier: 'ipad-13',
    colors: [
      { slug: 'silver', label: 'Silver' },
      { slug: 'space-gray', label: 'Space Gray' }
    ],
    defaultColor: 'silver'
  }
};
