"use client";

import { formatPhoneInput } from "./phone";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

export function PhoneInput({ value, onChange, ...props }: Props) {
  return <input {...props} value={value} onChange={(event) => onChange(formatPhoneInput(event.target.value))} inputMode="tel" autoComplete="tel" />;
}
