/**
 * Builds db/seed/exercises.json from the public-domain free-exercise-db
 * dataset (https://github.com/yuhonas/free-exercise-db, The Unlicense).
 *
 *   npx tsx scripts/build-exercise-seed.ts [path/to/exercises.json]
 *
 * Without a path, the dataset is downloaded. The output is committed so
 * seeding works offline; re-run this only to refresh the library.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { deriveRiskTags } from "../src/shared/exercise-safety";

type Source = {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
};

const URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
// Specialist sports lifting isn't part of a typical gym program.
const EXCLUDED_CATEGORIES = new Set(["strongman", "olympic weightlifting"]);

async function main() {
  const file = process.argv[2];
  const data: Source[] = file ? JSON.parse(await readFile(file, "utf8")) : await (await fetch(URL)).json();
  const out = data
    .filter((e) => !EXCLUDED_CATEGORIES.has(e.category))
    .map((e) => {
      const equipment = e.equipment ?? "body only";
      return {
        id: e.id,
        name: e.name,
        category: e.category,
        equipment,
        level: e.level,
        mechanic: e.mechanic,
        force: e.force,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles,
        instructions: e.instructions,
        images: e.images,
        riskTags: deriveRiskTags({ name: e.name, category: e.category, equipment, level: e.level, primaryMuscles: e.primaryMuscles }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  await mkdir("db/seed", { recursive: true });
  await writeFile("db/seed/exercises.json", JSON.stringify(out));
  console.log(`Wrote ${out.length} exercises to db/seed/exercises.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
