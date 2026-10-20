import { describe, expect, it } from "vitest";
import { calculateLateMinutes, calculatePayroll } from "./payroll.js";

describe("payroll calculations", () => {
  it("uses integer minor units for gross and net pay", () => {
    expect(
      calculatePayroll({
        basicCents: 700000,
        allowanceCents: 300000,
        bonusCents: 50000,
        deductionsCents: 35000,
        adjustmentCents: -10000,
      }),
    ).toEqual({
      grossCents: 1050000,
      netCents: 1005000,
      deductionsCents: 35000,
      bonusCents: 50000,
    });
  });
  it("rejects negative or fractional components and negative net pay", () => {
    expect(() => calculatePayroll({ basicCents: -1 })).toThrow(RangeError);
    expect(() =>
      calculatePayroll({ basicCents: 10, deductionsCents: 10.5 }),
    ).toThrow(RangeError);
    expect(() =>
      calculatePayroll({ basicCents: 0, adjustmentCents: -1 }),
    ).toThrow(RangeError);
  });
  it("calculates late minutes on the server clock without an implicit grace period", () => {
    expect(calculateLateMinutes(9 * 60 + 17, 9 * 60)).toBe(17);
    expect(calculateLateMinutes(9 * 60 + 17, 9 * 60, 5)).toBe(12);
  });
});
