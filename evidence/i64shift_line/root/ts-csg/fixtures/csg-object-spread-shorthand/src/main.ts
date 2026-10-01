const BASE_PROFILE = {
  profileId: "wenmo-basic-v1",
  useTrueSolarTime: false,
  lateZiBoundary: "00:00",
  monthBoundary: "jieqi",
} as const;

export function buildProfile(useTrueSolarTime: boolean, lateZiBoundary: "23:00" | "00:00") {
  return {
    ...BASE_PROFILE,
    useTrueSolarTime,
    lateZiBoundary,
  };
}
