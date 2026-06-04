/**
 * Electrical Object Definitions
 *
 * Professional SVG-based electrical symbols following Swedish/European standards.
 * These symbols are designed to look like proper BIM/CAD symbols.
 *
 * Swedish electrical installation standards:
 * - Outlets typically at 200mm (kickboard) or 1100mm (counter height)
 * - Switches at 1000mm from floor
 * - Standard outlet size: ~80x80mm face plate
 */

import { UnifiedObjectDefinition } from '../types';

/**
 * Single Outlet (Enkeluttag)
 * Circle with two dots representing plug holes
 */
export const SINGLE_OUTLET: UnifiedObjectDefinition = {
  id: 'single_outlet',
  name: 'Enkeluttag',
  nameKey: 'objects.electrical.singleOutlet',
  category: 'electrical',

  dimensions: {
    width: 80,
    height: 80,
    depth: 45,
  },

  // Floor plan view - simple circle with center dot
  floorPlanSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Outer circle
      {
        d: 'M40,4 A36,36 0 1,1 40,76 A36,36 0 1,1 40,4',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Left plug hole
      {
        d: 'M28,40 A4,4 0 1,1 28,40.01',
        fill: '#374151',
        stroke: 'none',
      },
      // Right plug hole
      {
        d: 'M52,40 A4,4 0 1,1 52,40.01',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  // Elevation view - rectangular face plate with socket
  elevationSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Face plate (rounded rectangle)
      {
        d: 'M8,4 h64 a4,4 0 0,1 4,4 v64 a4,4 0 0,1 -4,4 h-64 a4,4 0 0,1 -4,-4 v-64 a4,4 0 0,1 4,-4 z',
        fill: '#f9fafb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Socket circle
      {
        d: 'M40,20 A20,20 0 1,1 40,60 A20,20 0 1,1 40,20',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Left hole
      {
        d: 'M32,40 A3,3 0 1,1 32,40.01',
        fill: '#374151',
        stroke: 'none',
      },
      // Right hole
      {
        d: 'M48,40 A3,3 0 1,1 48,40.01',
        fill: '#374151',
        stroke: 'none',
      },
      // Ground (bottom hole)
      {
        d: 'M40,50 A3,3 0 1,1 40,50.01',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  wallBehavior: {
    attachesToWall: true,
    penetratesWall: false,
    defaultElevationMM: 200, // Swedish standard kickboard height
    side: 'interior',
    canFlip: false,
    canRotate: true,
  },

  tags: ['el', 'uttag', 'vägguttag', 'eluttag', 'outlet', 'socket'],
};

/**
 * Double Outlet (Dubbeluttag)
 * Rectangular shape with two socket circles
 */
export const DOUBLE_OUTLET: UnifiedObjectDefinition = {
  id: 'double_outlet',
  name: 'Dubbeluttag',
  nameKey: 'objects.electrical.doubleOutlet',
  category: 'electrical',

  dimensions: {
    width: 150,
    height: 80,
    depth: 45,
  },

  // Floor plan view - rectangle with two circles
  floorPlanSymbol: {
    viewBox: '0 0 150 80',
    paths: [
      // Outer rectangle
      {
        d: 'M4,8 h142 a4,4 0 0,1 4,4 v56 a4,4 0 0,1 -4,4 h-142 a4,4 0 0,1 -4,-4 v-56 a4,4 0 0,1 4,-4 z',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Left socket circle
      {
        d: 'M45,40 A18,18 0 1,1 45,40.01',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Left plug holes
      {
        d: 'M38,40 A3,3 0 1,1 38,40.01 M52,40 A3,3 0 1,1 52,40.01',
        fill: '#374151',
        stroke: 'none',
      },
      // Right socket circle
      {
        d: 'M105,40 A18,18 0 1,1 105,40.01',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Right plug holes
      {
        d: 'M98,40 A3,3 0 1,1 98,40.01 M112,40 A3,3 0 1,1 112,40.01',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  // Elevation view - horizontal double face plate
  elevationSymbol: {
    viewBox: '0 0 150 80',
    paths: [
      // Face plate
      {
        d: 'M4,4 h142 a4,4 0 0,1 4,4 v64 a4,4 0 0,1 -4,4 h-142 a4,4 0 0,1 -4,-4 v-64 a4,4 0 0,1 4,-4 z',
        fill: '#f9fafb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Divider line
      {
        d: 'M75,12 v56',
        fill: 'none',
        stroke: '#d1d5db',
        strokeWidth: 1,
      },
      // Left socket
      {
        d: 'M37.5,20 A18,18 0 1,1 37.5,60 A18,18 0 1,1 37.5,20',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Left holes
      {
        d: 'M30,40 A2.5,2.5 0 1,1 30,40.01 M45,40 A2.5,2.5 0 1,1 45,40.01 M37.5,50 A2.5,2.5 0 1,1 37.5,50.01',
        fill: '#374151',
        stroke: 'none',
      },
      // Right socket
      {
        d: 'M112.5,20 A18,18 0 1,1 112.5,60 A18,18 0 1,1 112.5,20',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Right holes
      {
        d: 'M105,40 A2.5,2.5 0 1,1 105,40.01 M120,40 A2.5,2.5 0 1,1 120,40.01 M112.5,50 A2.5,2.5 0 1,1 112.5,50.01',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  wallBehavior: {
    attachesToWall: true,
    penetratesWall: false,
    defaultElevationMM: 200,
    side: 'interior',
    canFlip: false,
    canRotate: true,
  },

  tags: ['el', 'uttag', 'dubbeluttag', 'vägguttag', 'double outlet', 'socket'],
};

/**
 * Light Switch (Strömbrytare)
 * Square with toggle indicator
 */
export const LIGHT_SWITCH: UnifiedObjectDefinition = {
  id: 'light_switch',
  name: 'Strömbrytare',
  nameKey: 'objects.electrical.lightSwitch',
  category: 'electrical',

  dimensions: {
    width: 80,
    height: 80,
    depth: 35,
  },

  // Floor plan view - square with diagonal line (standard symbol)
  floorPlanSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Outer square
      {
        d: 'M8,8 h64 v64 h-64 z',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Diagonal toggle line
      {
        d: 'M20,60 L60,20',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Toggle dot
      {
        d: 'M60,20 A4,4 0 1,1 60,20.01',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  // Elevation view - face plate with rocker switch
  elevationSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Face plate
      {
        d: 'M8,4 h64 a4,4 0 0,1 4,4 v64 a4,4 0 0,1 -4,4 h-64 a4,4 0 0,1 -4,-4 v-64 a4,4 0 0,1 4,-4 z',
        fill: '#f9fafb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Rocker switch body
      {
        d: 'M24,16 h32 a4,4 0 0,1 4,4 v40 a4,4 0 0,1 -4,4 h-32 a4,4 0 0,1 -4,-4 v-40 a4,4 0 0,1 4,-4 z',
        fill: '#e5e7eb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Toggle indicator (top = on)
      {
        d: 'M32,24 h16 v8 h-16 z',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  wallBehavior: {
    attachesToWall: true,
    penetratesWall: false,
    defaultElevationMM: 1000, // Swedish standard switch height
    side: 'interior',
    canFlip: true,
    canRotate: false,
  },

  tags: ['el', 'strömbrytare', 'brytare', 'switch', 'light switch', 'vippströmbrytare'],
};

/**
 * Dimmer Switch (Dimmer)
 * Square with rotary dial
 */
export const DIMMER_SWITCH: UnifiedObjectDefinition = {
  id: 'dimmer_switch',
  name: 'Dimmer',
  nameKey: 'objects.electrical.dimmerSwitch',
  category: 'electrical',

  dimensions: {
    width: 80,
    height: 80,
    depth: 45,
  },

  // Floor plan view - square with dial symbol
  floorPlanSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Outer square
      {
        d: 'M8,8 h64 v64 h-64 z',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Inner dial circle
      {
        d: 'M40,22 A18,18 0 1,1 40,58 A18,18 0 1,1 40,22',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Dial indicator line
      {
        d: 'M40,40 L40,26',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Dial knob
      {
        d: 'M40,26 A3,3 0 1,1 40,26.01',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  // Elevation view - face plate with rotary dimmer
  elevationSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Face plate
      {
        d: 'M8,4 h64 a4,4 0 0,1 4,4 v64 a4,4 0 0,1 -4,4 h-64 a4,4 0 0,1 -4,-4 v-64 a4,4 0 0,1 4,-4 z',
        fill: '#f9fafb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Dial outer ring
      {
        d: 'M40,16 A24,24 0 1,1 40,64 A24,24 0 1,1 40,16',
        fill: '#e5e7eb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Dial inner knob
      {
        d: 'M40,28 A12,12 0 1,1 40,52 A12,12 0 1,1 40,28',
        fill: '#d1d5db',
        stroke: '#374151',
        strokeWidth: 1,
      },
      // Indicator line
      {
        d: 'M40,40 L40,30',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Min/max arc indicators
      {
        d: 'M22,56 A22,22 0 0,1 22,24',
        fill: 'none',
        stroke: '#9ca3af',
        strokeWidth: 1,
      },
    ],
    defaultStroke: '#374151',
  },

  wallBehavior: {
    attachesToWall: true,
    penetratesWall: false,
    defaultElevationMM: 1000,
    side: 'interior',
    canFlip: false,
    canRotate: false,
  },

  tags: ['el', 'dimmer', 'ljusdimmer', 'dimmerströmbrytare', 'ljusreglering'],
};

/**
 * USB Outlet (USB-uttag)
 * Outlet with USB ports
 */
export const USB_OUTLET: UnifiedObjectDefinition = {
  id: 'usb_outlet',
  name: 'USB-uttag',
  nameKey: 'objects.electrical.usbOutlet',
  category: 'electrical',

  dimensions: {
    width: 80,
    height: 80,
    depth: 45,
  },

  // Floor plan view
  floorPlanSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Outer square with rounded corners
      {
        d: 'M8,8 h64 a0,0 0 0,1 0,0 v64 a0,0 0 0,1 0,0 h-64 a0,0 0 0,1 0,0 v-64 a0,0 0 0,1 0,0 z',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // USB symbol (simplified)
      {
        d: 'M30,30 h20 v20 h-20 z',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // USB trident symbol
      {
        d: 'M40,35 v10 M35,38 h10 M36,35 v3 M44,35 v3',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
    ],
    defaultStroke: '#374151',
  },

  // Elevation view
  elevationSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Face plate
      {
        d: 'M8,4 h64 a4,4 0 0,1 4,4 v64 a4,4 0 0,1 -4,4 h-64 a4,4 0 0,1 -4,-4 v-64 a4,4 0 0,1 4,-4 z',
        fill: '#f9fafb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // USB-A port 1
      {
        d: 'M24,28 h14 v10 h-14 z',
        fill: '#374151',
        stroke: 'none',
      },
      // USB-A port 2
      {
        d: 'M42,28 h14 v10 h-14 z',
        fill: '#374151',
        stroke: 'none',
      },
      // USB-C port
      {
        d: 'M32,48 h16 a3,3 0 0,1 3,3 v4 a3,3 0 0,1 -3,3 h-16 a3,3 0 0,1 -3,-3 v-4 a3,3 0 0,1 3,-3 z',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  wallBehavior: {
    attachesToWall: true,
    penetratesWall: false,
    defaultElevationMM: 200,
    side: 'interior',
    canFlip: false,
    canRotate: true,
  },

  tags: ['el', 'usb', 'uttag', 'laddning', 'usb outlet', 'charger'],
};

/**
 * Data Outlet (Datauttag / Nätverksuttag)
 * RJ45 ethernet port
 */
export const DATA_OUTLET: UnifiedObjectDefinition = {
  id: 'data_outlet',
  name: 'Datauttag',
  nameKey: 'objects.electrical.dataOutlet',
  category: 'electrical',

  dimensions: {
    width: 80,
    height: 80,
    depth: 35,
  },

  // Floor plan view - square with "network" symbol
  floorPlanSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Outer square
      {
        d: 'M8,8 h64 v64 h-64 z',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Network/data symbol (grid)
      {
        d: 'M25,25 h30 v30 h-30 z M25,40 h30 M40,25 v30',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
    ],
    defaultStroke: '#374151',
  },

  // Elevation view
  elevationSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Face plate
      {
        d: 'M8,4 h64 a4,4 0 0,1 4,4 v64 a4,4 0 0,1 -4,4 h-64 a4,4 0 0,1 -4,-4 v-64 a4,4 0 0,1 4,-4 z',
        fill: '#f9fafb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // RJ45 port shape
      {
        d: 'M28,30 h24 v20 h-24 z',
        fill: '#374151',
        stroke: 'none',
      },
      // Port opening
      {
        d: 'M31,33 h18 v14 h-18 z',
        fill: '#1f2937',
        stroke: 'none',
      },
      // Clip indicator
      {
        d: 'M36,30 h8 v-4 h-8 z',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  wallBehavior: {
    attachesToWall: true,
    penetratesWall: false,
    defaultElevationMM: 200,
    side: 'interior',
    canFlip: false,
    canRotate: true,
  },

  tags: ['data', 'nätverk', 'ethernet', 'rj45', 'lan', 'internet', 'datauttag'],
};

/**
 * TV Outlet (TV-uttag / Antennuttag)
 */
export const TV_OUTLET: UnifiedObjectDefinition = {
  id: 'tv_outlet',
  name: 'TV-uttag',
  nameKey: 'objects.electrical.tvOutlet',
  category: 'electrical',

  dimensions: {
    width: 80,
    height: 80,
    depth: 35,
  },

  // Floor plan view
  floorPlanSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Outer circle (coax style)
      {
        d: 'M40,8 A32,32 0 1,1 40,72 A32,32 0 1,1 40,8',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Inner circle
      {
        d: 'M40,24 A16,16 0 1,1 40,56 A16,16 0 1,1 40,24',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Center pin
      {
        d: 'M40,36 A4,4 0 1,1 40,44 A4,4 0 1,1 40,36',
        fill: '#374151',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  // Elevation view
  elevationSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Face plate
      {
        d: 'M8,4 h64 a4,4 0 0,1 4,4 v64 a4,4 0 0,1 -4,4 h-64 a4,4 0 0,1 -4,-4 v-64 a4,4 0 0,1 4,-4 z',
        fill: '#f9fafb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Coax connector outer
      {
        d: 'M40,20 A20,20 0 1,1 40,60 A20,20 0 1,1 40,20',
        fill: '#e5e7eb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Inner ring
      {
        d: 'M40,28 A12,12 0 1,1 40,52 A12,12 0 1,1 40,28',
        fill: '#374151',
        stroke: 'none',
      },
      // Center pin
      {
        d: 'M40,36 A4,4 0 1,1 40,44 A4,4 0 1,1 40,36',
        fill: '#fbbf24',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  wallBehavior: {
    attachesToWall: true,
    penetratesWall: false,
    defaultElevationMM: 300,
    side: 'interior',
    canFlip: false,
    canRotate: false,
  },

  tags: ['tv', 'antenn', 'coax', 'kabel-tv', 'tv-uttag', 'antenna'],
};

/**
 * Ceiling Lamp (Taklampa)
 * Ceiling-mounted fixture — sits on the ceiling, not a wall.
 * Floor plan: circle with a cross (standard ceiling light point symbol).
 * Elevation: mount plate, rod and shade seen from the front.
 */
export const CEILING_LAMP: UnifiedObjectDefinition = {
  id: 'ceiling_lamp',
  name: 'Taklampa',
  nameKey: 'objects.electrical.ceilingLamp',
  category: 'electrical',

  dimensions: {
    width: 300,
    height: 150,
    depth: 300,
  },

  // Floor plan view - circle with a cross (ceiling light point)
  floorPlanSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Outer circle
      {
        d: 'M14,40 a26,26 0 1,0 52,0 a26,26 0 1,0 -52,0',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Horizontal cross line
      {
        d: 'M22,40 H58',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
      // Vertical cross line
      {
        d: 'M40,22 V58',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 3,
      },
    ],
    defaultStroke: '#374151',
  },

  // Elevation view - ceiling mount, rod and shade
  elevationSymbol: {
    viewBox: '0 0 80 80',
    paths: [
      // Ceiling mount plate
      {
        d: 'M30,8 h20 v6 h-20 z',
        fill: '#e5e7eb',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Drop rod
      {
        d: 'M40,14 V26',
        fill: 'none',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Shade (trapezoid, wider at the bottom)
      {
        d: 'M32,26 H48 L56,52 H24 Z',
        fill: '#fef3c7',
        stroke: '#374151',
        strokeWidth: 2,
      },
      // Bulb glow
      {
        d: 'M40,52 a4,4 0 1,0 0.01,0',
        fill: '#fbbf24',
        stroke: 'none',
      },
    ],
    defaultStroke: '#374151',
  },

  wallBehavior: {
    attachesToWall: false,
    penetratesWall: false,
    defaultElevationMM: 2400, // ceiling height
    side: 'none',
    canFlip: false,
    canRotate: true,
  },

  tags: ['el', 'belysning', 'taklampa', 'lampa', 'ceiling lamp', 'ceiling light', 'lighting', 'armatur'],
};

/**
 * All electrical objects
 */
export const ELECTRICAL_OBJECTS: UnifiedObjectDefinition[] = [
  SINGLE_OUTLET,
  DOUBLE_OUTLET,
  LIGHT_SWITCH,
  DIMMER_SWITCH,
  USB_OUTLET,
  DATA_OUTLET,
  TV_OUTLET,
  CEILING_LAMP,
];

export default ELECTRICAL_OBJECTS;
