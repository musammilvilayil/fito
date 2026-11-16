import { z } from "zod";
import { EQUIPMENT_OPTIONS } from "./gym";
import { optionalText } from "./common";

const quantity = z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(1, "At least 1").max(999, "At most 999");

/** Add from the catalogue (catalogKey) or a custom item (name + category). */
export const equipmentAddSchema = z
  .object({
    catalogKey: z.string().trim().max(60).optional().nullable(),
    name: z.string().trim().max(80).optional().nullable(),
    category: z.enum(EQUIPMENT_OPTIONS).optional().nullable(),
    quantity: quantity.default(1),
    notes: optionalText(200),
  })
  .refine((v) => v.catalogKey || (v.name && v.name.length >= 2), { message: "Enter the equipment name", path: ["name"] })
  .refine((v) => v.catalogKey || v.category, { message: "Choose what it counts as", path: ["category"] });
export type EquipmentAddInput = z.input<typeof equipmentAddSchema>;

export const equipmentUpdateSchema = z.object({ quantity, notes: optionalText(200) });
