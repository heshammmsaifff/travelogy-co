import { z } from "zod";

/** Driver operations input schemas (CLAUDE.md §13, Phase 8b). */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalDate = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  );

const optionalUuid = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().uuid().optional(),
  );

export const createDriverSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(200),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_-]{1,20}$/, "drivers.errors.invalidInput"),
  phone: z.string().trim().min(6).max(40),
  licenceNumber: optionalText(60),
  licenceExpiry: optionalDate(),
  defaultVehicleTypeId: optionalUuid(),
  notes: optionalText(1000),
});

/** Editing never touches the email or the account status: both have their own path. */
export const updateDriverSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(2).max(200),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_-]{1,20}$/, "drivers.errors.invalidInput"),
  phone: z.string().trim().min(6).max(40),
  licenceNumber: optionalText(60),
  licenceExpiry: optionalDate(),
  defaultVehicleTypeId: optionalUuid(),
  notes: optionalText(1000),
});

export const assignDriverSchema = z.object({
  transferItemId: z.string().uuid(),
  driverId: z.string().uuid(),
  vehicleSeq: z.coerce.number().int().min(1).max(20),
});

export const advanceAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  // `cancelled` is deliberately absent: only dispatch cancels, and it does so
  // by removing the driver rather than through the driver's own screen.
  status: z.enum(["en_route", "arrived", "picked_up", "completed", "no_show"]),
  notes: optionalText(1000),
});
