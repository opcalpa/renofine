/**
 * Furniture objects — Swedish standard dimensions (mm).
 *
 * Symbol convention: viewBox proportions match width×depth; the TOP edge
 * (y=0) is the back/wall side where applicable.
 */

import { UnifiedObjectDefinition } from '../types';

const plainElevation = (w: number, h: number) => ({
  viewBox: `0 0 ${w} ${h}`,
  paths: [{ d: `M1,1 h${w - 2} v${h - 2} h-${w - 2} z`, fill: '#f3f4f6', stroke: '#374151', strokeWidth: 1.5 }],
  defaultStroke: '#374151',
});

export const BED_DOUBLE: UnifiedObjectDefinition = {
  id: 'furniture_bed_double',
  name: 'Dubbelsäng',
  nameKey: 'objects.furniture.bedDouble',
  category: 'furniture',
  dimensions: { width: 1600, height: 550, depth: 2000 },
  floorPlanSymbol: {
    viewBox: '0 0 160 200',
    paths: [
      { d: 'M2,2 h156 v196 h-156 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 2 },
      { d: 'M10,8 h64 v34 a4,4 0 0 1 -4,4 h-56 a4,4 0 0 1 -4,-4 z', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1 },
      { d: 'M86,8 h64 v34 a4,4 0 0 1 -4,4 h-56 a4,4 0 0 1 -4,-4 z', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1 },
      { d: 'M2,60 h156', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
      { d: 'M80,60 v138', fill: 'none', stroke: '#d1d5db', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(160, 55),
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['säng', 'dubbelsäng', 'bed', 'sovrum', 'möbel'],
};

export const BED_SINGLE: UnifiedObjectDefinition = {
  id: 'furniture_bed_single',
  name: 'Enkelsäng',
  nameKey: 'objects.furniture.bedSingle',
  category: 'furniture',
  dimensions: { width: 900, height: 550, depth: 2000 },
  floorPlanSymbol: {
    viewBox: '0 0 90 200',
    paths: [
      { d: 'M2,2 h86 v196 h-86 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 2 },
      { d: 'M12,8 h66 v34 a4,4 0 0 1 -4,4 h-58 a4,4 0 0 1 -4,-4 z', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1 },
      { d: 'M2,60 h86', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(90, 55),
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['säng', 'enkelsäng', 'bed', 'sovrum', 'möbel'],
};

export const SOFA_3SEAT: UnifiedObjectDefinition = {
  id: 'furniture_sofa_3',
  name: '3-sits soffa',
  nameKey: 'objects.furniture.sofa3',
  category: 'furniture',
  dimensions: { width: 2100, height: 850, depth: 900 },
  floorPlanSymbol: {
    viewBox: '0 0 210 90',
    paths: [
      { d: 'M2,2 h206 v20 h-206 z', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M2,2 v86 h18 v-66', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M208,2 v86 h-18 v-66', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M20,22 h170 v66 h-170 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M76.6,22 v66 M133.3,22 v66', fill: 'none', stroke: '#d1d5db', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(210, 85),
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['soffa', 'sofa', 'vardagsrum', 'möbel'],
};

export const ARMCHAIR: UnifiedObjectDefinition = {
  id: 'furniture_armchair',
  name: 'Fåtölj',
  nameKey: 'objects.furniture.armchair',
  category: 'furniture',
  dimensions: { width: 850, height: 800, depth: 850 },
  floorPlanSymbol: {
    viewBox: '0 0 85 85',
    paths: [
      { d: 'M2,2 h81 v18 h-81 z', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M2,2 v81 h16 v-63', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M83,2 v81 h-16 v-63', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M18,20 h49 v63 h-49 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(85, 80),
  wallBehavior: { attachesToWall: false, penetratesWall: false, defaultElevationMM: 0, side: 'none', canFlip: false, canRotate: true },
  tags: ['fåtölj', 'armchair', 'vardagsrum', 'möbel'],
};

export const DINING_TABLE: UnifiedObjectDefinition = {
  id: 'furniture_dining_table',
  name: 'Matbord',
  nameKey: 'objects.furniture.diningTable',
  category: 'furniture',
  dimensions: { width: 1400, height: 740, depth: 900 },
  floorPlanSymbol: {
    viewBox: '0 0 140 90',
    paths: [
      { d: 'M2,2 h136 v86 h-136 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 2 },
      { d: 'M8,8 h124 v74 h-124 z', fill: 'none', stroke: '#d1d5db', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(140, 74),
  wallBehavior: { attachesToWall: false, penetratesWall: false, defaultElevationMM: 0, side: 'none', canFlip: false, canRotate: true },
  tags: ['matbord', 'bord', 'table', 'kök', 'matplats', 'möbel'],
};

export const CHAIR: UnifiedObjectDefinition = {
  id: 'furniture_chair',
  name: 'Stol',
  nameKey: 'objects.furniture.chair',
  category: 'furniture',
  dimensions: { width: 450, height: 850, depth: 450 },
  floorPlanSymbol: {
    viewBox: '0 0 45 45',
    paths: [
      { d: 'M4,2 h37 v6 h-37 z', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.2 },
      { d: 'M6,8 h33 v33 a2,2 0 0 1 -2,2 h-29 a2,2 0 0 1 -2,-2 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.2 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(45, 85),
  wallBehavior: { attachesToWall: false, penetratesWall: false, defaultElevationMM: 0, side: 'none', canFlip: false, canRotate: true },
  tags: ['stol', 'chair', 'möbel'],
};

export const COFFEE_TABLE: UnifiedObjectDefinition = {
  id: 'furniture_coffee_table',
  name: 'Soffbord',
  nameKey: 'objects.furniture.coffeeTable',
  category: 'furniture',
  dimensions: { width: 1100, height: 450, depth: 600 },
  floorPlanSymbol: {
    viewBox: '0 0 110 60',
    paths: [
      { d: 'M6,2 h98 a4,4 0 0 1 4,4 v48 a4,4 0 0 1 -4,4 h-98 a4,4 0 0 1 -4,-4 v-48 a4,4 0 0 1 4,-4 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(110, 45),
  wallBehavior: { attachesToWall: false, penetratesWall: false, defaultElevationMM: 0, side: 'none', canFlip: false, canRotate: true },
  tags: ['soffbord', 'coffee table', 'vardagsrum', 'möbel'],
};

export const WARDROBE: UnifiedObjectDefinition = {
  id: 'furniture_wardrobe',
  name: 'Garderob',
  nameKey: 'objects.furniture.wardrobe',
  category: 'furniture',
  dimensions: { width: 1000, height: 2100, depth: 600 },
  floorPlanSymbol: {
    viewBox: '0 0 100 60',
    paths: [
      { d: 'M2,2 h96 v56 h-96 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 2 },
      { d: 'M50,2 v56', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
      { d: 'M8,30 h84', fill: 'none', stroke: '#d1d5db', strokeWidth: 1, },
      { d: 'M2,2 L98,58 M98,2 L2,58', fill: 'none', stroke: '#e5e7eb', strokeWidth: 0.8 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: {
    viewBox: '0 0 100 210',
    paths: [
      { d: 'M2,2 h96 v206 h-96 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 2 },
      { d: 'M50,2 v206', fill: 'none', stroke: '#9ca3af', strokeWidth: 1.5 },
      { d: 'M44,100 v14 M56,100 v14', fill: 'none', stroke: '#6b7280', strokeWidth: 2 },
    ],
    defaultStroke: '#374151',
  },
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['garderob', 'wardrobe', 'förvaring', 'sovrum', 'möbel'],
};

export const DESK: UnifiedObjectDefinition = {
  id: 'furniture_desk',
  name: 'Skrivbord',
  nameKey: 'objects.furniture.desk',
  category: 'furniture',
  dimensions: { width: 1200, height: 740, depth: 600 },
  floorPlanSymbol: {
    viewBox: '0 0 120 60',
    paths: [
      { d: 'M2,2 h116 v56 h-116 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 2 },
      { d: 'M40,44 h40 v3 h-40 z', fill: '#d1d5db', stroke: 'none' },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(120, 74),
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['skrivbord', 'desk', 'arbetsrum', 'möbel'],
};

export const TV_BENCH: UnifiedObjectDefinition = {
  id: 'furniture_tv_bench',
  name: 'TV-bänk',
  nameKey: 'objects.furniture.tvBench',
  category: 'furniture',
  dimensions: { width: 1600, height: 500, depth: 400 },
  floorPlanSymbol: {
    viewBox: '0 0 160 40',
    paths: [
      { d: 'M2,8 h156 v30 h-156 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M30,3 h100 v3 h-100 z', fill: '#374151', stroke: 'none' },
      { d: 'M55,8 v30 M105,8 v30', fill: 'none', stroke: '#d1d5db', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: plainElevation(160, 50),
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['tv-bänk', 'tv', 'mediabänk', 'vardagsrum', 'möbel'],
};

export const BOOKSHELF: UnifiedObjectDefinition = {
  id: 'furniture_bookshelf',
  name: 'Bokhylla',
  nameKey: 'objects.furniture.bookshelf',
  category: 'furniture',
  dimensions: { width: 800, height: 2000, depth: 300 },
  floorPlanSymbol: {
    viewBox: '0 0 80 30',
    paths: [
      { d: 'M2,2 h76 v26 h-76 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M21,2 v26 M40,2 v26 M59,2 v26', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: {
    viewBox: '0 0 80 200',
    paths: [
      { d: 'M2,2 h76 v196 h-76 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 2 },
      { d: 'M2,42 h76 M2,82 h76 M2,122 h76 M2,162 h76', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['bokhylla', 'hylla', 'bookshelf', 'förvaring', 'möbel'],
};

export const FURNITURE_OBJECTS: UnifiedObjectDefinition[] = [
  BED_DOUBLE,
  BED_SINGLE,
  SOFA_3SEAT,
  ARMCHAIR,
  DINING_TABLE,
  CHAIR,
  COFFEE_TABLE,
  WARDROBE,
  DESK,
  TV_BENCH,
  BOOKSHELF,
];

export default FURNITURE_OBJECTS;
