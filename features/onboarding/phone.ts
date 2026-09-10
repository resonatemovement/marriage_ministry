const allowedPhoneCharacters = /^[0-9+().\s-]*$/;

export function formatPhoneInput(value: string) {
  const cleaned = value.replace(/[^0-9+().\s-]/g, "");
  if (!allowedPhoneCharacters.test(cleaned)) return "";
  const digits = cleaned.replace(/\D/g, "");
  const national = digits.startsWith("1") && digits.length > 10 ? digits.slice(1, 11) : digits.slice(0, 10);
  if (national.length <= 3) return national;
  if (national.length <= 6) return `(${national.slice(0, 3)}) ${national.slice(3)}`;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

export function isValidPhone(value: string) {
  const normalized = normalizePhone(value);
  return /^\+1\d{10}$/.test(normalized);
}
