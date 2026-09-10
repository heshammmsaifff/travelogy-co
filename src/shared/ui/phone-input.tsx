"use client";

import { useId, type ReactNode } from "react";
import {
  PhoneInput as RIPPhoneInput,
  type PhoneInputProps as RIPPhoneInputProps,
} from "react-international-phone";
import "react-international-phone/style.css";
import { LuCircleAlert } from "react-icons/lu";
import { cn } from "@/shared/lib/cn";

export interface PhoneInputProps {
  /** Form field name — the hidden input carries this so the full E.164 value is submitted. */
  name: string;
  label?: ReactNode;
  /** Helper text shown under the field while it is valid. */
  hint?: ReactNode;
  /** Validation message. Its presence puts the field into the error state. */
  error?: string;
  /** Default phone value (E.164 or partial, e.g. "+201234567890"). */
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** ISO 3166-1 alpha-2 code for the initial country (lowercase). Defaults to none (empty). */
  defaultCountry?: RIPPhoneInputProps["defaultCountry"];
}

/**
 * International phone number input with country flag, dial code, and searchable
 * country dropdown.
 *
 * Wraps `react-international-phone` and adapts it to the project's design system
 * (same height, radii, border colors, and font sizing as `<Input />`).
 *
 * The value submitted with the form is always the **full E.164 phone string**
 * (e.g. "+201234567890"), carried by a hidden `<input name={name}>`.
 *
 * Note on RTL: the phone number itself is always LTR (numbers read left-to-right
 * universally), so the inner container is forced to `dir="ltr"`. The label,
 * hint, and error messages above / below the input respect the page direction.
 */
export function PhoneInput({
  name,
  label,
  hint,
  error,
  defaultValue,
  required,
  disabled,
  className,
  defaultCountry,
}: PhoneInputProps) {
  const generatedId = useId();
  const inputId = `phone-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(error);

  const defaultCountryCode = defaultCountry ?? "eg";
  const preferredCountries = ["eg", "sa", "ae", "kw", "qa", "bh", "om", "jo"];

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ms-0.5 text-danger-600" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {/*
        Force LTR on the phone widget: phone numbers are always LTR even in an
        Arabic UI, and the library's internal layout (flag on the left, digits
        flowing right) depends on it.
      */}
      <div dir="ltr">
        <RIPPhoneInput
          defaultCountry={defaultCountryCode}
          preferredCountries={preferredCountries}
          value={defaultValue}
          inputProps={{
            id: inputId,
            name,
            required,
            "aria-invalid": hasError || undefined,
            "aria-describedby": hasError ? errorId : hint ? hintId : undefined,
          }}
          disabled={disabled}
          className={cn(
            "phone-input-custom",
            hasError && "phone-input-custom--error",
          )}
          inputClassName="phone-input-custom__input"
          countrySelectorStyleProps={{
            buttonClassName: "phone-input-custom__selector",
          }}
        />
      </div>

      {hasError ? (
        <p
          id={errorId}
          className="flex items-center gap-1.5 text-xs text-danger-700"
          role="alert"
        >
          <LuCircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
