/**
 * Custom/DIY objects — the user's own boxes with real dimensions.
 *
 * This is Renofine's "sketch your own idea" primitive: a platsbyggd bänk, a
 * skräddarsydd garderob, an arbetsbänk — placed at true scale so you can see
 * how YOUR measurements fit the actual room. Dimensions are per-instance
 * overrides (metadata.customWidthMM/customDepthMM/customHeightMM); the
 * catalog entry only provides the default footprint and the sketch symbol.
 */

import { UnifiedObjectDefinition } from '../types';

export const CUSTOM_BOX: UnifiedObjectDefinition = {
  id: 'custom_box',
  name: 'Eget objekt',
  nameKey: 'objects.custom.box',
  category: 'custom',
  dimensions: { width: 600, height: 720, depth: 600 },
  floorPlanSymbol: {
    // Sketch look: solid outline + light diagonal cross, reads as "planned/DIY"
    viewBox: '0 0 60 60',
    paths: [
      { d: 'M1,1 h58 v58 h-58 z', fill: '#fefce8', stroke: '#a16207', strokeWidth: 1.5 },
      { d: 'M1,1 L59,59 M59,1 L1,59', fill: 'none', stroke: '#eab308', strokeWidth: 0.75 },
    ],
    defaultStroke: '#a16207',
  },
  elevationSymbol: {
    viewBox: '0 0 60 72',
    paths: [
      { d: 'M1,1 h58 v70 h-58 z', fill: '#fefce8', stroke: '#a16207', strokeWidth: 1.5 },
      { d: 'M1,1 L59,71 M59,1 L1,71', fill: 'none', stroke: '#eab308', strokeWidth: 0.75 },
    ],
    defaultStroke: '#a16207',
  },
  wallBehavior: {
    attachesToWall: true,
    penetratesWall: false,
    defaultElevationMM: 0,
    side: 'interior',
    canFlip: false,
    canRotate: true,
  },
  tags: ['eget', 'diy', 'platsbyggd', 'custom', 'bänk', 'garderob', 'möbel', 'skiss'],
  description: 'Rita in en egen möbel eller installation med dina egna mått',
};

export const CUSTOM_OBJECTS: UnifiedObjectDefinition[] = [CUSTOM_BOX];
