/**
 * Built-in catalogue of common gym equipment. Gyms pick what they have and
 * how many; `category` is the exercise-library equipment type the item
 * counts as, so workout plans only use exercises the gym can do.
 */
export type EquipmentCategory =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "body only"
  | "kettlebells"
  | "bands"
  | "medicine ball"
  | "exercise ball"
  | "foam roll"
  | "e-z curl bar"
  | "other";

export const EQUIPMENT_GROUPS = [
  "Cardio",
  "Free weights",
  "Benches & racks",
  "Upper-body machines",
  "Lower-body machines",
  "Cable & functional",
  "Accessories",
  "Other",
] as const;
export type EquipmentGroup = (typeof EQUIPMENT_GROUPS)[number];

export type CatalogItem = { key: string; name: string; group: EquipmentGroup; category: EquipmentCategory };

const item = (key: string, name: string, group: EquipmentGroup, category: EquipmentCategory): CatalogItem => ({ key, name, group, category });

export const EQUIPMENT_CATALOG: CatalogItem[] = [
  // Cardio
  item("treadmill", "Treadmill", "Cardio", "machine"),
  item("curved-treadmill", "Curved (manual) treadmill", "Cardio", "machine"),
  item("elliptical", "Elliptical cross trainer", "Cardio", "machine"),
  item("upright-bike", "Upright exercise bike", "Cardio", "machine"),
  item("recumbent-bike", "Recumbent bike", "Cardio", "machine"),
  item("spin-bike", "Spin bike", "Cardio", "machine"),
  item("air-bike", "Air bike (fan bike)", "Cardio", "machine"),
  item("rowing-machine", "Rowing machine", "Cardio", "machine"),
  item("stair-climber", "Stair climber", "Cardio", "machine"),
  item("stepper", "Stepper", "Cardio", "machine"),
  item("ski-erg", "Ski erg", "Cardio", "machine"),
  item("arc-trainer", "Arc trainer", "Cardio", "machine"),
  item("vertical-climber", "Vertical climber", "Cardio", "machine"),
  // Free weights
  item("dumbbells", "Dumbbells (pairs)", "Free weights", "dumbbell"),
  item("dumbbell-rack", "Dumbbell rack", "Free weights", "dumbbell"),
  item("adjustable-dumbbells", "Adjustable dumbbells", "Free weights", "dumbbell"),
  item("olympic-barbell", "Olympic barbell (20 kg)", "Free weights", "barbell"),
  item("womens-barbell", "Women's barbell (15 kg)", "Free weights", "barbell"),
  item("fixed-barbells", "Fixed-weight barbells", "Free weights", "barbell"),
  item("ez-bar", "EZ curl bar", "Free weights", "e-z curl bar"),
  item("trap-bar", "Trap / hex bar", "Free weights", "barbell"),
  item("safety-squat-bar", "Safety squat bar", "Free weights", "barbell"),
  item("olympic-plates", "Olympic weight plates", "Free weights", "barbell"),
  item("bumper-plates", "Bumper plates", "Free weights", "barbell"),
  item("standard-plates", "Standard weight plates", "Free weights", "barbell"),
  item("kettlebells", "Kettlebells", "Free weights", "kettlebells"),
  item("medicine-balls", "Medicine balls", "Free weights", "medicine ball"),
  item("slam-balls", "Slam balls", "Free weights", "medicine ball"),
  item("wall-balls", "Wall balls", "Free weights", "medicine ball"),
  item("sandbags", "Sandbags", "Free weights", "other"),
  item("weight-vest", "Weighted vest", "Free weights", "other"),
  // Benches & racks
  item("flat-bench", "Flat bench", "Benches & racks", "barbell"),
  item("adjustable-bench", "Adjustable bench", "Benches & racks", "dumbbell"),
  item("incline-bench-press", "Incline bench press station", "Benches & racks", "barbell"),
  item("decline-bench", "Decline bench", "Benches & racks", "barbell"),
  item("olympic-bench-press", "Olympic flat bench press", "Benches & racks", "barbell"),
  item("power-rack", "Power rack", "Benches & racks", "barbell"),
  item("squat-rack", "Squat rack / stands", "Benches & racks", "barbell"),
  item("half-rack", "Half rack", "Benches & racks", "barbell"),
  item("smith-machine", "Smith machine", "Benches & racks", "machine"),
  item("preacher-bench", "Preacher curl bench", "Benches & racks", "e-z curl bar"),
  item("ab-bench", "Ab / sit-up bench", "Benches & racks", "body only"),
  item("roman-chair", "Roman chair / back extension", "Benches & racks", "body only"),
  item("ghd", "Glute-ham developer (GHD)", "Benches & racks", "body only"),
  item("dip-station", "Dip station", "Benches & racks", "body only"),
  item("pull-up-bar", "Pull-up bar", "Benches & racks", "body only"),
  item("power-tower", "Power tower (pull-up/dip/knee raise)", "Benches & racks", "body only"),
  item("plate-tree", "Plate tree / storage", "Benches & racks", "other"),
  item("deadlift-platform", "Deadlift platform", "Benches & racks", "barbell"),
  // Upper-body machines
  item("chest-press", "Chest press machine", "Upper-body machines", "machine"),
  item("incline-chest-press", "Incline chest press machine", "Upper-body machines", "machine"),
  item("pec-deck", "Pec deck / rear delt fly", "Upper-body machines", "machine"),
  item("shoulder-press", "Shoulder press machine", "Upper-body machines", "machine"),
  item("lateral-raise", "Lateral raise machine", "Upper-body machines", "machine"),
  item("lat-pulldown", "Lat pulldown machine", "Upper-body machines", "cable"),
  item("seated-row", "Seated row machine", "Upper-body machines", "cable"),
  item("t-bar-row", "T-bar row", "Upper-body machines", "barbell"),
  item("chest-supported-row", "Chest-supported row machine", "Upper-body machines", "machine"),
  item("assisted-pull-up", "Assisted pull-up / dip machine", "Upper-body machines", "machine"),
  item("bicep-curl-machine", "Biceps curl machine", "Upper-body machines", "machine"),
  item("tricep-machine", "Triceps extension / dip machine", "Upper-body machines", "machine"),
  item("ab-crunch-machine", "Ab crunch machine", "Upper-body machines", "machine"),
  item("rotary-torso", "Rotary torso machine", "Upper-body machines", "machine"),
  item("hammer-strength", "Plate-loaded (Hammer Strength style) stations", "Upper-body machines", "machine"),
  // Lower-body machines
  item("leg-press", "Leg press (45°)", "Lower-body machines", "machine"),
  item("horizontal-leg-press", "Horizontal leg press", "Lower-body machines", "machine"),
  item("hack-squat", "Hack squat machine", "Lower-body machines", "machine"),
  item("pendulum-squat", "Pendulum / V-squat machine", "Lower-body machines", "machine"),
  item("leg-extension", "Leg extension machine", "Lower-body machines", "machine"),
  item("seated-leg-curl", "Seated leg curl machine", "Lower-body machines", "machine"),
  item("lying-leg-curl", "Lying leg curl machine", "Lower-body machines", "machine"),
  item("standing-calf", "Standing calf raise machine", "Lower-body machines", "machine"),
  item("seated-calf", "Seated calf raise machine", "Lower-body machines", "machine"),
  item("hip-abductor", "Hip abductor machine", "Lower-body machines", "machine"),
  item("hip-adductor", "Hip adductor machine", "Lower-body machines", "machine"),
  item("hip-thrust", "Hip thrust / glute bridge machine", "Lower-body machines", "machine"),
  item("glute-kickback", "Glute kickback machine", "Lower-body machines", "machine"),
  item("belt-squat", "Belt squat machine", "Lower-body machines", "machine"),
  // Cable & functional
  item("cable-crossover", "Cable crossover", "Cable & functional", "cable"),
  item("functional-trainer", "Functional trainer (dual cable)", "Cable & functional", "cable"),
  item("single-cable", "Single cable column", "Cable & functional", "cable"),
  item("multi-gym", "Multi-gym station", "Cable & functional", "cable"),
  item("trx", "Suspension trainer (TRX)", "Cable & functional", "other"),
  item("battle-ropes", "Battle ropes", "Cable & functional", "other"),
  item("plyo-boxes", "Plyo boxes", "Cable & functional", "body only"),
  item("sled", "Push / pull sled", "Cable & functional", "other"),
  item("landmine", "Landmine attachment", "Cable & functional", "barbell"),
  item("gymnastic-rings", "Gymnastic rings", "Cable & functional", "body only"),
  item("climbing-rope", "Climbing rope", "Cable & functional", "other"),
  item("agility-ladder", "Agility ladder", "Cable & functional", "body only"),
  item("parallettes", "Parallettes", "Cable & functional", "body only"),
  item("boxing-bag", "Punching / boxing bag", "Cable & functional", "other"),
  // Accessories
  item("resistance-bands", "Resistance bands", "Accessories", "bands"),
  item("mini-bands", "Mini loop bands", "Accessories", "bands"),
  item("stability-balls", "Stability (Swiss) balls", "Accessories", "exercise ball"),
  item("bosu", "BOSU balance trainer", "Accessories", "exercise ball"),
  item("foam-rollers", "Foam rollers", "Accessories", "foam roll"),
  item("yoga-mats", "Yoga / exercise mats", "Accessories", "body only"),
  item("ab-wheel", "Ab wheel", "Accessories", "body only"),
  item("aerobic-steps", "Aerobic steps", "Accessories", "body only"),
  item("skipping-ropes", "Skipping ropes", "Accessories", "other"),
  item("cable-attachments", "Cable attachments (handles, ropes, bars)", "Accessories", "cable"),
  item("lifting-belts", "Lifting belts", "Accessories", "other"),
  item("dip-belt", "Dip / chin belt", "Accessories", "other"),
  item("chalk", "Chalk", "Accessories", "other"),
  item("weighing-scale", "Weighing scale", "Accessories", "other"),
  item("body-composition", "Body composition analyser", "Accessories", "other"),
  item("mirror-wall", "Mirror wall", "Accessories", "other"),
];

export const CATALOG_BY_KEY = new Map(EQUIPMENT_CATALOG.map((i) => [i.key, i]));

/** Exercise equipment types a gym can use, from its equipment list (bodyweight always). */
export function categoriesFrom(items: { category: string }[]): string[] {
  const set = new Set<string>(items.map((i) => i.category).filter((c) => c !== "other"));
  set.add("body only");
  return [...set].sort();
}
