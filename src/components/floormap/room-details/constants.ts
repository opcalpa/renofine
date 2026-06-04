// Room name suggestions for ComboboxFretext — keyed for i18n
export const ROOM_NAME_SUGGESTION_KEYS = [
  "roomNames.livingRoom",
  "roomNames.kitchen",
  "roomNames.bedroom",
  "roomNames.bedroom1",
  "roomNames.bedroom2",
  "roomNames.bedroom3",
  "roomNames.bathroom",
  "roomNames.toilet",
  "roomNames.hallway",
  "roomNames.entrance",
  "roomNames.study",
  "roomNames.office",
  "roomNames.laundryRoom",
  "roomNames.walkInCloset",
  "roomNames.storage",
  "roomNames.balcony",
  "roomNames.patio",
  "roomNames.garage",
  "roomNames.basement",
  "roomNames.attic",
  "roomNames.guestRoom",
  "roomNames.playroom",
  "roomNames.diningRoom",
  "roomNames.familyRoom",
];

// Room status options (values are i18n keys under roomStatuses.*)
export const ROOM_STATUS_OPTIONS = [
  { value: "existing", labelKey: "roomStatuses.existing" },
  { value: "to_be_renovated", labelKey: "roomStatuses.toBeRenovated" },
  { value: "new_construction", labelKey: "roomStatuses.newConstruction" },
];

// Priority options (values are i18n keys under tasks.priority*)
export const PRIORITY_OPTIONS = [
  { value: "low", labelKey: "tasks.priorityLow" },
  { value: "medium", labelKey: "tasks.priorityMedium" },
  { value: "high", labelKey: "tasks.priorityHigh" },
];

// Floor material options
export const FLOOR_MATERIAL_OPTIONS = [
  { value: "parkett", labelKey: "materials.parquet" },
  { value: "klinker", labelKey: "materials.tiles" },
  { value: "linoleum", labelKey: "materials.linoleum" },
  { value: "betong", labelKey: "materials.concrete" },
  { value: "laminat", labelKey: "materials.laminate" },
  { value: "vinyl", labelKey: "materials.vinyl" },
  { value: "matta", labelKey: "materials.carpet" },
  { value: "sten", labelKey: "materials.stone" },
];

// Floor treatment options (multi-select)
export const FLOOR_TREATMENT_OPTIONS = [
  { value: "vaxad", labelKey: "treatments.waxed" },
  { value: "oljad", labelKey: "treatments.oiled" },
  { value: "mattlackad", labelKey: "treatments.matteLacquered" },
  { value: "naturell", labelKey: "treatments.natural" },
  { value: "hoglans", labelKey: "treatments.highGloss" },
  { value: "slipad", labelKey: "treatments.sanded" },
];

// Skirting (golvlist) options
export const SKIRTING_OPTIONS = [
  { value: "tra_10cm", labelKey: "skirting.wood10cm" },
  { value: "tra_7cm", labelKey: "skirting.wood7cm" },
  { value: "tra_5cm", labelKey: "skirting.wood5cm" },
  { value: "mdf_10cm", labelKey: "skirting.mdf10cm" },
  { value: "mdf_7cm", labelKey: "skirting.mdf7cm" },
  { value: "aluminium", labelKey: "skirting.aluminium" },
  { value: "ingen", labelKey: "materials.none" },
];

// Ceiling material options
export const CEILING_MATERIAL_OPTIONS = [
  { value: "gips", labelKey: "materials.drywall" },
  { value: "puts", labelKey: "materials.plaster" },
  { value: "akustikplattor", labelKey: "materials.acousticTiles" },
  { value: "tra_panel", labelKey: "materials.woodPanel" },
  { value: "spant", labelKey: "materials.stretchCeiling" },
];

// Ceiling molding (taklist) options
export const CEILING_MOLDING_OPTIONS = [
  { value: "halkarl", labelKey: "molding.coveCornice" },
  { value: "svanhals", labelKey: "molding.swanNeck" },
  { value: "klassisk", labelKey: "molding.classic" },
  { value: "modern", labelKey: "molding.modern" },
  { value: "ingen", labelKey: "materials.none" },
];

// Wall treatment options (multi-select)
export const WALL_TREATMENT_OPTIONS = [
  { value: "malat", labelKey: "treatments.painted" },
  { value: "tapetserat", labelKey: "treatments.wallpapered" },
  { value: "kaklat", labelKey: "treatments.tiled" },
  { value: "panel", labelKey: "treatments.panelled" },
  { value: "puts", labelKey: "materials.plaster" },
  { value: "betong", labelKey: "materials.concrete" },
  { value: "tegel", labelKey: "materials.brick" },
];

// Wall material options (for walls and elevation objects)
export const WALL_MATERIAL_OPTIONS = [
  { value: "gips", labelKey: "materials.drywall" },
  { value: "betong", labelKey: "materials.concrete" },
  { value: "tegelsten", labelKey: "materials.brick" },
  { value: "lattvaggsblock", labelKey: "materials.lightweightBlock" },
  { value: "tra_regelverk", labelKey: "materials.woodFraming" },
  { value: "stalreglar", labelKey: "materials.steelStuds" },
  { value: "mdf", labelKey: "materials.mdf" },
  { value: "osb", labelKey: "materials.osb" },
  { value: "plywood", labelKey: "materials.plywood" },
  { value: "glasvagg", labelKey: "materials.glassWall" },
];

// Elevation object material options
export const ELEVATION_OBJECT_MATERIAL_OPTIONS = [
  { value: "tra", labelKey: "materials.wood" },
  { value: "metall", labelKey: "materials.metal" },
  { value: "glas", labelKey: "materials.glass" },
  { value: "sten", labelKey: "materials.stone" },
  { value: "keramik", labelKey: "materials.ceramic" },
  { value: "plast", labelKey: "materials.plastic" },
  { value: "tyg", labelKey: "materials.fabric" },
  { value: "lader", labelKey: "materials.leather" },
  { value: "gips", labelKey: "materials.drywall" },
  { value: "betong", labelKey: "materials.concrete" },
];

// Door type options
export const DOOR_TYPE_OPTIONS = [
  { value: "spegeldorr", labelKey: "doors.panelDoor" },
  { value: "slat", labelKey: "doors.flush" },
  { value: "glasad", labelKey: "doors.glazed" },
  { value: "panel", labelKey: "doors.panel" },
  { value: "skjutdorr", labelKey: "doors.sliding" },
  { value: "pardorr", labelKey: "doors.doubleDoor" },
];

// Trim type options
export const TRIM_TYPE_OPTIONS = [
  { value: "klassisk", labelKey: "trim.classic" },
  { value: "modern", labelKey: "trim.modern" },
  { value: "minimalistisk", labelKey: "trim.minimalist" },
  { value: "antik", labelKey: "trim.antique" },
  { value: "ingen", labelKey: "materials.none" },
];

// Electrical series options
export const ELECTRICAL_SERIES_OPTIONS = [
  { value: "schneider_renova", labelKey: "electrical.schneiderRenova" },
  { value: "elko_rs", labelKey: "electrical.elkoRS" },
  { value: "gira", labelKey: "electrical.gira" },
  { value: "jung", labelKey: "electrical.jung" },
  { value: "abb", labelKey: "electrical.abb" },
];

// Outlet/switch type options (multi-select)
export const OUTLET_TYPE_OPTIONS = [
  { value: "enkel_uttag", labelKey: "outlets.singleOutlet" },
  { value: "dubbel_uttag", labelKey: "outlets.doubleOutlet" },
  { value: "usb_uttag", labelKey: "outlets.usbOutlet" },
  { value: "enkel_brytare", labelKey: "outlets.singleSwitch" },
  { value: "dubbel_brytare", labelKey: "outlets.doubleSwitch" },
  { value: "dimmer", labelKey: "outlets.dimmer" },
  { value: "rorelsedetktor", labelKey: "outlets.motionSensor" },
];

// Lighting type options (multi-select)
export const LIGHTING_TYPE_OPTIONS = [
  { value: "taklampa", labelKey: "lighting.ceilingLight" },
  { value: "spotlights", labelKey: "lighting.spotlights" },
  { value: "vagglampa", labelKey: "lighting.wallLight" },
  { value: "led_list", labelKey: "lighting.ledStrip" },
  { value: "golvlampa", labelKey: "lighting.floorLamp" },
  { value: "pendel", labelKey: "lighting.pendant" },
];

// Electrical room-item subtypes (E2). Mirrors the unified object library's
// electrical catalog ids/nameKeys (objectLibrary/definitions/electrical.ts) so a
// logged list item maps cleanly onto a placed canvas object in E3. Keep in sync.
export const ELECTRICAL_ITEM_SUBTYPE_OPTIONS = [
  { value: "single_outlet", labelKey: "objects.electrical.singleOutlet" },
  { value: "double_outlet", labelKey: "objects.electrical.doubleOutlet" },
  { value: "usb_outlet", labelKey: "objects.electrical.usbOutlet" },
  { value: "data_outlet", labelKey: "objects.electrical.dataOutlet" },
  { value: "tv_outlet", labelKey: "objects.electrical.tvOutlet" },
  { value: "light_switch", labelKey: "objects.electrical.lightSwitch" },
  { value: "dimmer_switch", labelKey: "objects.electrical.dimmerSwitch" },
  { value: "ceiling_lamp", labelKey: "objects.electrical.ceilingLamp" },
];

// Heating type options
export const HEATING_TYPE_OPTIONS = [
  { value: "radiator", labelKey: "heating.radiator" },
  { value: "golvarme", labelKey: "heating.underfloorHeating" },
  { value: "konvektor", labelKey: "heating.convector" },
  { value: "elvärme", labelKey: "heating.electricHeating" },
  { value: "ingen", labelKey: "materials.none" },
];

// Room color palette
export const ROOM_COLOR_OPTIONS = [
  { nameKey: "colors.blue", color: "rgba(59, 130, 246, 0.2)", hex: "#3b82f6" },
  { nameKey: "colors.green", color: "rgba(16, 185, 129, 0.2)", hex: "#10b981" },
  { nameKey: "colors.orange", color: "rgba(245, 158, 11, 0.2)", hex: "#f59e0b" },
  { nameKey: "colors.purple", color: "rgba(168, 85, 247, 0.2)", hex: "#a855f7" },
  { nameKey: "colors.pink", color: "rgba(236, 72, 153, 0.2)", hex: "#ec4899" },
  { nameKey: "colors.cyan", color: "rgba(6, 182, 212, 0.2)", hex: "#06b6d4" },
  { nameKey: "colors.yellow", color: "rgba(251, 191, 36, 0.2)", hex: "#fbbf24" },
  { nameKey: "colors.grey", color: "rgba(100, 116, 139, 0.2)", hex: "#64748b" },
];

// Default form values
export const DEFAULT_FORM_VALUES = {
  name: "",
  description: "",
  color: "rgba(59, 130, 246, 0.2)",
  status: "existing",
  ceiling_height_mm: 2400,
  priority: "medium",
  links: "",
  notes: "",
  area_sqm: undefined as number | undefined,
  width_mm: undefined as number | undefined,
  depth_mm: undefined as number | undefined,
  non_paintable_area_sqm: undefined as number | undefined,
  floor_spec: {},
  ceiling_spec: {},
  wall_spec: {},
  joinery_spec: {},
  electrical_spec: {},
  heating_spec: {},
  checklists: [],
};
