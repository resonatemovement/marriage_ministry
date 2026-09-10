export function passwordError(password: string, confirmation: string) {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}
