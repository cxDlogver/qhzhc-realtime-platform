import request from "@/utils/request";

export interface SessionProfile {
  id: number;
  username: string;
  first_name?: string;
  displayName?: string;
  is_superuser: boolean;
  role: "admin" | "operator";
  can_visit_realtime: boolean;
  can_visit_history: boolean;
}

export function isCompleteSessionProfile(
  value: unknown,
): value is SessionProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<SessionProfile>;
  return (
    Number.isSafeInteger(profile.id) &&
    Number(profile.id) > 0 &&
    typeof profile.username === "string" &&
    profile.username.trim().length > 0 &&
    typeof profile.is_superuser === "boolean" &&
    (profile.role === "admin" || profile.role === "operator") &&
    typeof profile.can_visit_realtime === "boolean" &&
    typeof profile.can_visit_history === "boolean"
  );
}

export async function fetchSessionProfile(): Promise<SessionProfile> {
  const response = await request.get<SessionProfile>("/api/auth/session");
  return response.data;
}
