import { describe, expect, it } from "vitest";
import { safeNext } from "@/shared/safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/s/abc123")).toBe("/s/abc123");
    expect(safeNext("/me/workouts?day=2")).toBe("/me/workouts?day=2");
  });
  it("refuses anything that could leave the site", () => {
    for (const v of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "/ok\\..", "/a\nb", "", undefined, ["/x"], "/" + "a".repeat(400)]) {
      expect(safeNext(v)).toBeNull();
    }
  });
});
