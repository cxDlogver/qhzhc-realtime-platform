import { isCompleteSessionProfile } from "@/services/authSession";

const completeProfile = {
  id: 1,
  username: "admin",
  is_superuser: true,
  role: "admin",
  can_visit_realtime: true,
  can_visit_history: true,
};

describe("session profile validation", () => {
  test("accepts a complete cached profile", () => {
    expect(isCompleteSessionProfile(completeProfile)).toBe(true);
  });

  test.each([
    null,
    {},
    { ...completeProfile, id: 0 },
    { ...completeProfile, username: "" },
    { ...completeProfile, role: "unknown" },
    { ...completeProfile, can_visit_realtime: undefined },
  ])("rejects an incomplete cached profile", (profile) => {
    expect(isCompleteSessionProfile(profile)).toBe(false);
  });
});
