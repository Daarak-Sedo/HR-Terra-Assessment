export interface PayrollInput {
  basicCents: number;
  allowanceCents?: number;
  bonusCents?: number;
  deductionsCents?: number;
  adjustmentCents?: number;
}
export interface PayrollCalculation {
  grossCents: number;
  netCents: number;
  deductionsCents: number;
  bonusCents: number;
}

export function calculatePayroll(input: PayrollInput): PayrollCalculation {
  const values = [
    input.basicCents,
    input.allowanceCents ?? 0,
    input.bonusCents ?? 0,
    input.deductionsCents ?? 0,
    input.adjustmentCents ?? 0,
  ];
  if (
    !values.every((value) => Number.isSafeInteger(value)) ||
    input.basicCents < 0 ||
    (input.allowanceCents ?? 0) < 0 ||
    (input.bonusCents ?? 0) < 0 ||
    (input.deductionsCents ?? 0) < 0
  ) {
    throw new RangeError(
      "Payroll values must be non-negative integer minor units, except signed adjustments.",
    );
  }
  const grossCents =
    input.basicCents + (input.allowanceCents ?? 0) + (input.bonusCents ?? 0);
  const netCents =
    grossCents - (input.deductionsCents ?? 0) + (input.adjustmentCents ?? 0);
  if (
    !Number.isSafeInteger(grossCents) ||
    !Number.isSafeInteger(netCents) ||
    netCents < 0
  )
    throw new RangeError("Payroll result is outside the supported range.");
  return {
    grossCents,
    netCents,
    deductionsCents: input.deductionsCents ?? 0,
    bonusCents: input.bonusCents ?? 0,
  };
}

export function calculateLateMinutes(
  actualMinute: number,
  shiftStartMinute: number,
  graceMinutes = 0,
): number {
  if (
    ![actualMinute, shiftStartMinute, graceMinutes].every(Number.isFinite) ||
    graceMinutes < 0
  )
    throw new RangeError(
      "Attendance times and grace must be valid minute values.",
    );
  return Math.max(
    0,
    Math.floor(actualMinute) -
      Math.floor(shiftStartMinute) -
      Math.floor(graceMinutes),
  );
}
