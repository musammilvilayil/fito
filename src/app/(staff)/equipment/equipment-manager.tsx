"use client";

import { Minus, PackageOpen, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { EQUIPMENT_CATALOG, EQUIPMENT_GROUPS, type CatalogItem } from "@/shared/equipment-catalog";
import { EQUIPMENT_OPTIONS } from "@/shared/schemas/gym";

export type EquipmentItem = { id: string; catalogKey: string | null; name: string; group: string; category: string; quantity: number; notes: string | null };

const groupOrder = new Map<string, number>(EQUIPMENT_GROUPS.map((g, i) => [g, i]));
const sortItems = (items: EquipmentItem[]) =>
  [...items].sort((a, b) => (groupOrder.get(a.group) ?? 99) - (groupOrder.get(b.group) ?? 99) || a.name.localeCompare(b.name));
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function EquipmentManager({ initial, canManage }: { initial: EquipmentItem[]; canManage: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(() => sortItems(initial));
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = norm(filter);
    return q ? items.filter((i) => norm(`${i.name} ${i.group} ${i.category}`).includes(q)) : items;
  }, [items, filter]);
  const groups = EQUIPMENT_GROUPS.map((g) => ({ group: g, items: visible.filter((i) => i.group === g) })).filter((g) => g.items.length);

  async function setQuantity(item: EquipmentItem, quantity: number) {
    if (quantity < 1 || quantity > 999 || quantity === item.quantity) return;
    const before = items;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    try {
      await api(`/equipment/${item.id}`, { method: "PATCH", body: { quantity, notes: item.notes } });
      router.refresh();
    } catch (err) {
      setItems(before);
      toast.error(errorMessage(err));
    }
  }

  async function remove(item: EquipmentItem) {
    setBusy(item.id);
    try {
      await api(`/equipment/${item.id}`, { method: "DELETE" });
      setItems((list) => list.filter((i) => i.id !== item.id));
      toast.success(`${item.name} removed`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function added(row: EquipmentItem) {
    setItems((list) => sortItems([...list, row]));
    router.refresh();
  }

  return (
    <div className={cn("grid grid-cols-1 gap-6", canManage && "lg:grid-cols-[minmax(0,1fr)_400px]")}>
      <Card className="min-w-0">
        <CardHeader
          title="Your equipment"
          description={items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : undefined}
          action={
            items.length > 6 && (
              <div className="relative w-44 sm:w-56">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
                <Input
                  aria-label="Filter your equipment"
                  className="h-9 pl-9"
                  placeholder="Filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            )
          }
        />
        {items.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="No equipment listed yet"
            description={canManage ? "Search the catalogue to add what your gym has." : "Ask the owner or a trainer to add the gym's equipment."}
            className="py-12"
          />
        ) : groups.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-muted">Nothing matches &ldquo;{filter}&rdquo;.</p>
        ) : (
          <div className="divide-y divide-line">
            {groups.map((g) => (
              <section key={g.group} aria-label={g.group} className="px-5 py-4">
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">{g.group}</h3>
                <ul className="space-y-1">
                  {g.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 rounded-xl py-1.5" data-testid="equipment-row">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{item.name}</div>
                        <div className="truncate text-[12px] capitalize text-ink-subtle">
                          {item.category === "other" ? "Not used in workout plans" : item.category}
                        </div>
                      </div>
                      {canManage ? (
                        <>
                          <Stepper item={item} onChange={(q) => void setQuantity(item, q)} />
                          <Button variant="ghost" size="icon" aria-label={`Remove ${item.name}`} loading={busy === item.id} onClick={() => void remove(item)}>
                            {busy !== item.id && <Trash2 />}
                          </Button>
                        </>
                      ) : (
                        <span className="tabular rounded-full bg-raised px-3 py-1 text-[13px] font-semibold">× {item.quantity}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      {/* On phones, adding comes first so it isn't below a long list. */}
      {canManage && (
        <div className="order-first min-w-0 lg:order-none">
          <AddPanel have={items} onAdded={added} />
        </div>
      )}
    </div>
  );
}

function Stepper({ item, onChange }: { item: EquipmentItem; onChange: (q: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isInteger(n) && n >= 1 && n <= 999) onChange(n);
    setDraft(null);
  };
  return (
    <div className="flex items-center rounded-full border border-line bg-panel/70 p-0.5">
      <button
        type="button"
        className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-raised hover:text-ink disabled:opacity-40"
        aria-label={`One fewer ${item.name}`}
        disabled={item.quantity <= 1}
        onClick={() => onChange(item.quantity - 1)}
      >
        <Minus className="size-4" />
      </button>
      <input
        aria-label={`How many: ${item.name}`}
        inputMode="numeric"
        className="tabular w-10 bg-transparent text-center text-[14px] font-semibold outline-none"
        value={draft ?? String(item.quantity)}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(null);
        }}
      />
      <button
        type="button"
        className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-raised hover:text-ink disabled:opacity-40"
        aria-label={`One more ${item.name}`}
        disabled={item.quantity >= 999}
        onClick={() => onChange(item.quantity + 1)}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function AddPanel({ have, onAdded }: { have: EquipmentItem[]; onAdded: (row: EquipmentItem) => void }) {
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState({ name: "", category: "machine", quantity: "1" });
  const [showCustom, setShowCustom] = useState(false);
  const haveKeys = new Set(have.map((i) => i.catalogKey).filter(Boolean));
  const haveNames = new Set(have.map((i) => i.name.toLowerCase()));

  const q = norm(query);
  const results: CatalogItem[] = q
    ? EQUIPMENT_CATALOG.filter((c) => !haveKeys.has(c.key) && norm(`${c.name} ${c.group}`).includes(q)).slice(0, 30)
    : EQUIPMENT_CATALOG.filter((c) => !haveKeys.has(c.key)).slice(0, 8);

  async function add(body: Record<string, unknown>, key: string, name: string) {
    setBusy(key);
    try {
      const row = await api<EquipmentItem>("/equipment", { body });
      onAdded(row);
      toast.success(`${name} added`);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <Card>
        <CardHeader title="Add from the catalogue" description={`${EQUIPMENT_CATALOG.length - haveKeys.size} common items to choose from`} />
        <CardBody className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              aria-label="Search equipment catalogue"
              className="pl-9 pr-9"
              placeholder="Search: treadmill, leg press, dumbbells…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-subtle hover:text-ink"
                onClick={() => setQuery("")}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {!q && <p className="hidden text-[12px] text-ink-subtle lg:block">Suggestions. Type to search all {EQUIPMENT_CATALOG.length}.</p>}
          {results.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              Not in the catalogue.{" "}
              <button
                type="button"
                className="font-medium text-lime hover:underline"
                onClick={() => {
                  setCustom((c) => ({ ...c, name: query.trim() }));
                  setShowCustom(true);
                }}
              >
                Add &ldquo;{query.trim()}&rdquo; as your own item
              </button>
            </p>
          ) : (
            <ul
              className={cn("max-h-[420px] divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-panel/60", !q && "hidden lg:block")}
              data-testid="catalogue-results"
            >
              {results.map((c) => (
                <li key={c.key} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{c.name}</div>
                    <div className="truncate text-[11.5px] text-ink-subtle">{c.group}</div>
                  </div>
                  <input
                    aria-label={`Quantity of ${c.name}`}
                    inputMode="numeric"
                    className="tabular h-8 w-12 rounded-lg border border-line bg-raised text-center text-[13px] outline-none focus:border-lime"
                    value={qty[c.key] ?? "1"}
                    onChange={(e) => setQty((m) => ({ ...m, [c.key]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                  />
                  <Button
                    size="sm"
                    variant="soft"
                    loading={busy === c.key}
                    onClick={() => void add({ catalogKey: c.key, quantity: Number(qty[c.key] || 1) }, c.key, c.name)}
                  >
                    {busy !== c.key && <Plus />} Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {!showCustom ? (
        <Button variant="secondary" className="w-full" onClick={() => setShowCustom(true)}>
          <Plus /> Add an item that isn&apos;t in the catalogue
        </Button>
      ) : (
        <Card>
          <CardHeader
            title="Add your own item"
            description="For anything the catalogue doesn't have."
            action={
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setShowCustom(false)}>
                <X />
              </Button>
            }
          />
          <CardBody>
            <form
              className="space-y-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const name = custom.name.trim();
                if (name.length < 2) return void toast.error("Enter the equipment name");
                if (haveNames.has(name.toLowerCase())) return void toast.error(`${name} is already on your list.`);
                void add({ name, category: custom.category, quantity: Number(custom.quantity || 1) }, "custom", name).then((ok) => {
                  if (ok) setCustom({ name: "", category: custom.category, quantity: "1" });
                });
              }}
            >
              <Field label="Name" htmlFor="custom-name">
                <Input
                  id="custom-name"
                  placeholder="e.g. Hammer Strength iso-lateral row"
                  value={custom.name}
                  onChange={(e) => setCustom({ ...custom, name: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                <Field label="Counts as" htmlFor="custom-category" hint="So workouts can use it">
                  <Select id="custom-category" value={custom.category} onChange={(e) => setCustom({ ...custom, category: e.target.value })}>
                    {EQUIPMENT_OPTIONS.filter((o) => o !== "other").map((o) => (
                      <option key={o} value={o}>
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </option>
                    ))}
                    <option value="other">Other (not for workouts)</option>
                  </Select>
                </Field>
                <Field label="How many" htmlFor="custom-qty">
                  <Input
                    id="custom-qty"
                    inputMode="numeric"
                    value={custom.quantity}
                    onChange={(e) => setCustom({ ...custom, quantity: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" loading={busy === "custom"}>
                  <Plus /> Add item
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
