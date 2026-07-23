/**
 * Plumbing / bathroom objects — Swedish standard dimensions (mm).
 *
 * Symbol convention: viewBox proportions match width×depth; the TOP edge
 * (y=0) is the wall side (back) for wall-attached objects, matching the
 * kitchen definitions.
 */

import { UnifiedObjectDefinition } from '../types';

export const TOILET: UnifiedObjectDefinition = {
  id: 'plumbing_toilet',
  name: 'Toalett',
  nameKey: 'objects.plumbing.toilet',
  category: 'plumbing',
  dimensions: { width: 370, height: 800, depth: 650 },
  floorPlanSymbol: {
    viewBox: '0 0 37 65',
    paths: [
      { d: 'M4,1 h29 v14 a2,2 0 0 1 -2,2 h-25 a2,2 0 0 1 -2,-2 z', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M18.5,17 c8,0 13,5 13,14 c0,10 -5,17 -13,17 c-8,0 -13,-7 -13,-17 c0,-9 5,-14 13,-14 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M18.5,22 c5.5,0 9,4 9,10 c0,7 -3.5,12 -9,12 c-5.5,0 -9,-5 -9,-12 c0,-6 3.5,-10 9,-10 z', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: {
    viewBox: '0 0 37 80',
    paths: [
      { d: 'M4,10 h29 v22 h-29 z', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M7,32 h23 v10 a11,14 0 0 1 -23,0 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M13,56 h11 v24 h-11 z', fill: '#e5e7eb', stroke: '#6b7280', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['toalett', 'wc', 'toilet', 'badrum', 'vvs'],
};

export const BATHROOM_SINK: UnifiedObjectDefinition = {
  id: 'plumbing_sink',
  name: 'Handfat',
  nameKey: 'objects.plumbing.sink',
  category: 'plumbing',
  dimensions: { width: 600, height: 200, depth: 450 },
  floorPlanSymbol: {
    viewBox: '0 0 60 45',
    paths: [
      { d: 'M2,1 h56 v10 c0,20 -12,32 -28,32 c-16,0 -28,-12 -28,-32 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M8,6 h44 v6 c0,15 -9,24 -22,24 c-13,0 -22,-9 -22,-24 z', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
      { d: 'M30,26 a2.5,2.5 0 1 1 0.01,0', fill: '#6b7280', stroke: 'none' },
      { d: 'M27,1 v-4 h6 v4', fill: 'none', stroke: '#6b7280', strokeWidth: 1.5 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: {
    viewBox: '0 0 60 20',
    paths: [
      { d: 'M2,0 h56 v5 c0,6 -10,10 -28,10 c-18,0 -28,-4 -28,-10 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M27,0 v-8 a4,4 0 0 1 6,0 v5', fill: 'none', stroke: '#6b7280', strokeWidth: 2 },
    ],
    defaultStroke: '#374151',
  },
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 850, side: 'interior', canFlip: false, canRotate: true },
  tags: ['handfat', 'tvättställ', 'sink', 'badrum', 'vvs'],
};

export const SHOWER: UnifiedObjectDefinition = {
  id: 'plumbing_shower',
  name: 'Dusch',
  nameKey: 'objects.plumbing.shower',
  category: 'plumbing',
  dimensions: { width: 900, height: 2000, depth: 900 },
  floorPlanSymbol: {
    viewBox: '0 0 90 90',
    paths: [
      { d: 'M2,2 h86 v86 h-86 z', fill: '#f3f4f6', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M2,2 L88,88', fill: 'none', stroke: '#d1d5db', strokeWidth: 1 },
      { d: 'M88,2 L2,88', fill: 'none', stroke: '#d1d5db', strokeWidth: 1 },
      { d: 'M45,49 a4,4 0 1 1 0.01,0', fill: 'none', stroke: '#6b7280', strokeWidth: 1.5 },
      { d: 'M8,8 a6,6 0 1 1 0.01,0', fill: '#9ca3af', stroke: '#6b7280', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: {
    viewBox: '0 0 90 200',
    paths: [
      { d: 'M2,0 v200 M88,0 v200', fill: 'none', stroke: '#374151', strokeWidth: 2 },
      { d: 'M10,15 h20 M20,15 v10 a8,8 0 0 0 8,8', fill: 'none', stroke: '#6b7280', strokeWidth: 2 },
      { d: 'M22,40 l-4,12 M28,40 l0,12 M34,40 l4,12', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: true, canRotate: true },
  tags: ['dusch', 'duschhörna', 'shower', 'badrum', 'vvs'],
};

export const BATHTUB: UnifiedObjectDefinition = {
  id: 'plumbing_bathtub',
  name: 'Badkar',
  nameKey: 'objects.plumbing.bathtub',
  category: 'plumbing',
  dimensions: { width: 1700, height: 600, depth: 700 },
  floorPlanSymbol: {
    viewBox: '0 0 170 70',
    paths: [
      { d: 'M2,2 h166 v66 h-166 z', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 2 },
      { d: 'M12,10 h146 a10,10 0 0 1 10,10 v30 a10,10 0 0 1 -10,10 h-146 a10,10 0 0 1 -10,-10 v-30 a10,10 0 0 1 10,-10 z', fill: '#f9fafb', stroke: '#6b7280', strokeWidth: 1.2 },
      { d: 'M22,35 a3,3 0 1 1 0.01,0', fill: '#6b7280', stroke: 'none' },
      { d: 'M14,25 a2,2 0 1 1 0.01,0', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: {
    viewBox: '0 0 170 60',
    paths: [
      { d: 'M2,10 h166 v50 h-166 z', fill: '#e5e7eb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M2,10 h166', fill: 'none', stroke: '#6b7280', strokeWidth: 2 },
      { d: 'M20,0 v10 M20,0 h12', fill: 'none', stroke: '#6b7280', strokeWidth: 2 },
    ],
    defaultStroke: '#374151',
  },
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: true, canRotate: true },
  tags: ['badkar', 'bathtub', 'kar', 'badrum', 'vvs'],
};

export const WASHING_MACHINE: UnifiedObjectDefinition = {
  id: 'plumbing_washing_machine',
  name: 'Tvättmaskin',
  nameKey: 'objects.plumbing.washingMachine',
  category: 'plumbing',
  dimensions: { width: 600, height: 850, depth: 600 },
  floorPlanSymbol: {
    viewBox: '0 0 60 60',
    paths: [
      { d: 'M2,2 h56 v56 h-56 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M30,49 a19,19 0 1 1 0.01,0', fill: 'none', stroke: '#6b7280', strokeWidth: 1.5 },
      { d: 'M30,41 a11,11 0 1 1 0.01,0', fill: 'none', stroke: '#9ca3af', strokeWidth: 1 },
      { d: 'M6,6 h48 v6 h-48 z', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 0.8 },
      { d: 'M2,2 L14,14 M58,2 L46,14', fill: 'none', stroke: '#d1d5db', strokeWidth: 0.8 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: {
    viewBox: '0 0 60 85',
    paths: [
      { d: 'M2,0 h56 v85 h-56 z', fill: '#f9fafb', stroke: '#374151', strokeWidth: 1.5 },
      { d: 'M6,4 h48 v12 h-48 z', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1 },
      { d: 'M30,68 a22,22 0 1 1 0.01,0', fill: 'none', stroke: '#6b7280', strokeWidth: 2 },
      { d: 'M30,60 a14,14 0 1 1 0.01,0', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1 },
    ],
    defaultStroke: '#374151',
  },
  wallBehavior: { attachesToWall: true, penetratesWall: false, defaultElevationMM: 0, side: 'interior', canFlip: false, canRotate: true },
  tags: ['tvättmaskin', 'washing machine', 'tvätt', 'vvs'],
};

export const FLOOR_DRAIN: UnifiedObjectDefinition = {
  id: 'plumbing_floor_drain',
  name: 'Golvbrunn',
  nameKey: 'objects.plumbing.floorDrain',
  category: 'plumbing',
  dimensions: { width: 150, height: 50, depth: 150 },
  floorPlanSymbol: {
    viewBox: '0 0 15 15',
    paths: [
      { d: 'M1,1 h13 v13 h-13 z', fill: '#f3f4f6', stroke: '#374151', strokeWidth: 1 },
      { d: 'M7.5,12.5 a5,5 0 1 1 0.01,0', fill: 'none', stroke: '#6b7280', strokeWidth: 0.8 },
      { d: 'M4,7.5 h7 M7.5,4 v7', fill: 'none', stroke: '#6b7280', strokeWidth: 0.8 },
    ],
    defaultStroke: '#374151',
  },
  elevationSymbol: {
    viewBox: '0 0 15 5',
    paths: [{ d: 'M1,0 h13 v3 h-13 z', fill: '#9ca3af', stroke: '#374151', strokeWidth: 0.8 }],
    defaultStroke: '#374151',
  },
  wallBehavior: { attachesToWall: false, penetratesWall: false, defaultElevationMM: 0, side: 'none', canFlip: false, canRotate: false },
  tags: ['golvbrunn', 'brunn', 'drain', 'badrum', 'vvs'],
};

export const PLUMBING_OBJECTS: UnifiedObjectDefinition[] = [
  TOILET,
  BATHROOM_SINK,
  SHOWER,
  BATHTUB,
  WASHING_MACHINE,
  FLOOR_DRAIN,
];

export default PLUMBING_OBJECTS;
