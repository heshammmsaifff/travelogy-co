import { z } from "zod";

import { isCountryCode } from "@/shared/lib/countries";

/**
 * Auth input schemas.
 *
 * CLAUDE.md §3: one schema per concern, reused by the React Hook Form resolver
 * on the client AND by the Server Action on the server. §12: server-side
 * validation is mandatory regardless of what the client did.
 *
 * Messages are i18n *keys*, not sentences — the form resolves them against the
 * catalogue so validation errors are bilingual like everything else (§5).
 */

const email = z
  .string()
  .trim()
  .min(1, "auth.validation.emailRequired")
  .email("auth.validation.emailInvalid")
  .max(255)
  .toLowerCase();

/**
 * Password policy. Deliberately length-first rather than a symbol-class maze:
 * length is what actually resists guessing, and complexity rules mostly push
 * people towards predictable substitutions.
 */
const newPassword = z
  .string()
  .min(10, "auth.validation.passwordTooShort")
  .max(72, "auth.validation.passwordTooLong") // bcrypt truncates beyond 72 bytes
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), "auth.validation.passwordNeedsCase")
  .refine((v) => /\d/.test(v), "auth.validation.passwordNeedsDigit");

export const loginSchema = z.object({
  email,
  // No policy check on sign-in: the rules may have changed since the account
  // was created, and rejecting a valid old password would lock people out.
  password: z.string().min(1, "auth.validation.passwordRequired"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "auth.validation.nameRequired").max(120),
    email,
    password: newPassword,
    confirmPassword: z.string(),

    agencyName: z.string().trim().min(2, "auth.validation.agencyNameRequired").max(200),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s-]{7,20}$/, "auth.validation.phoneInvalid"),
    countryCode: z
      .string()
      .trim()
      .length(2, "auth.validation.countryRequired")
      .toUpperCase()
      // The picker only offers real codes; this is the server half of that,
      // because a form field is a suggestion and a POST body is not (§12).
      .refine(isCountryCode, "auth.validation.countryRequired"),
    city: z.string().trim().max(120).optional().or(z.literal("")),
    commercialRegNo: z.string().trim().max(60).optional().or(z.literal("")),
    taxId: z.string().trim().max(60).optional().or(z.literal("")),

    acceptTerms: z.literal(true, { message: "auth.validation.mustAcceptTerms" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "auth.validation.passwordsDoNotMatch",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "auth.validation.passwordsDoNotMatch",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
