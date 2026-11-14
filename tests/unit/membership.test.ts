import { describe, expect, it } from "vitest";
import { parseLooseDate } from "@/shared/dates";
import { durationLabel, periodEnd, renewalStart } from "@/shared/membership";

describe("membership periods", () => {
  it("computes inclusive end dates", () => {
    expect(periodEnd("2026-01-01", "months", 1)).toBe("2026-01-31");
    expect(periodEnd("2026-01-31", "months", 1)).toBe("2026-02-27");
    expect(periodEnd("2026-11-15", "months", 3)).toBe("2027-02-14");
    expect(periodEnd("2026-11-15", "months", 12)).toBe("2027-11-14");
    expect(periodEnd("2026-11-15", "days", 1)).toBe("2026-11-15");
    expect(periodEnd("2026-11-15", "days", 30)).toBe("2026-12-14");
  });

  it("starts early renewals after the current period and late renewals today", () => {
    expect(renewalStart("2026-11-20", "2026-11-14")).toBe("2026-11-21");
    expect(renewalStart("2026-11-14", "2026-11-14")).toBe("2026-11-15");
    expect(renewalStart("2026-11-10", "2026-11-14")).toBe("2026-11-14");
    expect(renewalStart(null, "2026-11-14")).toBe("2026-11-14");
  });

  it("labels durations", () => {
    expect(durationLabel("months", 1)).toBe("1 month");
    expect(durationLabel("months", 3)).toBe("3 months");
    expect(durationLabel("months", 12)).toBe("1 year");
    expect(durationLabel("days", 15)).toBe("15 days");
  });
});

describe("spreadsheet dates", () => {
  it.each([
    ["2026-11-15", "2026-11-15"],
    ["15/11/2026", "2026-11-15"],
    ["5-1-2026", "2026-01-05"],
    ["15.11.26", "2026-11-15"],
    ["15 Nov 2026", "2026-11-15"],
    ["2026-11-15T00:00:00.000Z", "2026-11-15"],
    [46341, "2026-11-15"],
  ])("parses %s", (input, out) => expect(parseLooseDate(input)).toBe(out));

  it("rejects impossible dates", () => {
    expect(parseLooseDate("31/02/2026")).toBeNull();
    expect(parseLooseDate("hello")).toBeNull();
    expect(parseLooseDate("")).toBeNull();
  });
});
