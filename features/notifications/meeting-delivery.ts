export async function attemptIndependently<T>(items: T[], attempt: (item: T) => Promise<void>) {
  return Promise.all(items.map(async (item) => {
    try {
      await attempt(item);
      return { status: "fulfilled" as const };
    } catch (reason) {
      return { status: "rejected" as const, reason };
    }
  }));
}
