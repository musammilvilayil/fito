import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, financialYear, isISODate, todayIn } from "@/shared/dates";
import { formatINR, percentOf, rupeesToPaise } from "@/shared/money";
import { can, ROLE_PERMISSIONS } from "@/shared/permissions";
import { formatPhone, normalizePhone, whatsappLink } from "@/shared/phone";

describe("phone", () => {
  it.each([
    ["98470 12345", "+919847012345"],
    ["098470-12345", "+919847012345"],
    ["+91 98470 12345", "+919847012345"],
    ["919847012345", "+919847012345"],
    ["0091 9847012345", "+919847012345"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalises %s", (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each(["", "12345", "5847012345", "abc", "+1"])("rejects %s", (input) => expect(normalizePhone(input)).toBeNull());

  it("formats and links", () => {
    expect(formatPhone("+919847012345")).toBe("+91 98470 12345");
    expect(whatsappLink("+919847012345", "Hi there")).toBe("https://wa.me/919847012345?text=Hi%20there");
  });
});

describe("money", () => {
  it("parses rupees to paise without floating point errors", () => {
    expect(rupeesToPaise("1,500")).toBe(150000);
    expect(rupeesToPaise("1500.5")).toBe(150050);
    expect(rupeesToPaise("0.29")).toBe(29);
    expect(rupeesToPaise(999.99)).toBe(99999);
    expect(rupeesToPaise("₹ 2,000")).toBe(200000);
    expect(rupeesToPaise("12.345")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
  });

  it("formats with Indian grouping", () => {
    expect(formatINR(150000)).toBe("₹1,500");
    expect(formatINR(12345678900)).toBe("₹12,34,56,789");
    expect(formatINR(150050)).toBe("₹1,500.50");
    expect(formatINR(150000, { alwaysPaise: true })).toBe("₹1,500.00");
    expect(formatINR(-5000)).toBe("-₹50");
  });

  it("computes percentages in paise", () => {
    expect(percentOf(150000, 10)).toBe(15000);
    expect(percentOf(99999, 15)).toBe(15000);
  });
});

describe("dates", () => {
  it("adds months with end-of-month clamping", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-15", 3)).toBe("2026-06-15");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-05-10", 12)).toBe("2027-05-10");
  });

  it("adds and diffs days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-01-01", "2026-12-31")).toBe(364);
  });

  it("validates dates and gives the Indian financial year", () => {
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(financialYear("2026-03-31")).toBe("2025-26");
    expect(financialYear("2026-04-01")).toBe("2026-27");
  });

  it("computes today in the gym's time zone", () => {
    // 20:00 UTC on 14 Nov is already 15 Nov in India (UTC+5:30).
    expect(todayIn("Asia/Kolkata", new Date("2026-11-14T20:00:00Z"))).toBe("2026-11-15");
    expect(todayIn("UTC", new Date("2026-11-14T20:00:00Z"))).toBe("2026-11-14");
  });
});

describe("permissions", () => {
  it("gives owners everything and members nothing", () => {
    expect(can("owner", "gym.manage")).toBe(true);
    expect(ROLE_PERMISSIONS.member.size).toBe(0);
  });

  it("keeps front desk out of revenue reports, voids and workouts", () => {
    expect(can("receptionist", "payments.record")).toBe(true);
    expect(can("receptionist", "reports.view")).toBe(false);
    expect(can("receptionist", "payments.void")).toBe(false);
    expect(can("receptionist", "workouts.manage")).toBe(false);
  });

  it("lets trainers work on workouts but not money or staff", () => {
    expect(can("trainer", "workouts.approve")).toBe(true);
    expect(can("trainer", "ai.generate")).toBe(true);
    expect(can("trainer", "payments.view")).toBe(false);
    expect(can("trainer", "staff.manage")).toBe(false);
  });

  it("lets managers do everything except gym settings", () => {
    expect(can("manager", "staff.manage")).toBe(true);
    expect(can("manager", "gym.manage")).toBe(false);
  });
});

describe("compact rupees", () => {
  it("uses Indian units", async () => {
    const { compactRupees } = await import("@/shared/money");
    expect(compactRupees(0)).toBe("0");
    expect(compactRupees(1250000)).toBe("12.5K");
    expect(compactRupees(10000000)).toBe("1L");
    expect(compactRupees(1000000000)).toBe("1Cr");
    expect(compactRupees(-500000)).toBe("-5K");
  });
});
