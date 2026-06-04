"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { ApplicationData, YesNo } from "@/lib/types";

type Name = keyof ApplicationData | `${string}.${number}.${string}`;

export function Field({
  label,
  name,
  register,
  errors,
  type = "text",
  required = false,
  placeholder,
  helper,
  inputMode,
  readOnly = false
}: {
  label: string;
  name: Name;
  register: UseFormRegister<ApplicationData>;
  errors?: FieldErrors<ApplicationData>;
  type?: string;
  required?: boolean | string;
  placeholder?: string;
  helper?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  readOnly?: boolean;
}) {
  const message = getError(errors, name);
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        type={type}
        placeholder={placeholder}
        inputMode={inputMode}
        readOnly={readOnly}
        {...register(name as never, {
          required: required ? (typeof required === "string" ? required : `${label} is required.`) : false
        })}
      />
      {helper ? <small>{helper}</small> : null}
      {message ? <div className="error">{message}</div> : null}
    </div>
  );
}

export function TextArea({
  label,
  name,
  register,
  errors,
  required = false,
  placeholder
}: {
  label: string;
  name: Name;
  register: UseFormRegister<ApplicationData>;
  errors?: FieldErrors<ApplicationData>;
  required?: boolean | string;
  placeholder?: string;
}) {
  const message = getError(errors, name);
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <textarea
        id={name}
        placeholder={placeholder}
        {...register(name as never, {
          required: required ? (typeof required === "string" ? required : `${label} is required.`) : false
        })}
      />
      {message ? <div className="error">{message}</div> : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  register,
  errors,
  required = false,
  children
}: {
  label: string;
  name: keyof ApplicationData;
  register: UseFormRegister<ApplicationData>;
  errors?: FieldErrors<ApplicationData>;
  required?: boolean | string;
  children: React.ReactNode;
}) {
  const message = getError(errors, name);
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select
        id={name}
        {...register(name, {
          required: required ? (typeof required === "string" ? required : `${label} is required.`) : false
        })}
      >
        {children}
      </select>
      {message ? <div className="error">{message}</div> : null}
    </div>
  );
}

export function YesNoChoice({
  label,
  value,
  onChange
}: {
  label: string;
  value: YesNo;
  onChange: (value: YesNo) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="choice-row">
        <label>
          <input type="radio" checked={value === "yes"} onChange={() => onChange("yes")} />
          Yes
        </label>
        <label>
          <input type="radio" checked={value === "no"} onChange={() => onChange("no")} />
          No
        </label>
      </div>
    </div>
  );
}

export function getError(errors: FieldErrors<ApplicationData> | undefined, name: Name) {
  if (!errors) return "";
  const parts = String(name).split(".");
  let current: unknown = errors;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return "";
    }
  }
  return typeof current === "object" && current && "message" in current
    ? String((current as { message?: string }).message || "")
    : "";
}
