/** Counts recent runs per key, and refuses another once `max` fall within the window. */
export function rateLimiter(max: number, windowMs: number) {
  const recent = new Map<string, number[]>();
  return {
    /** Records a run for `key`; false when the window is already full. */
    take(key: string): boolean {
      const now = Date.now();
      for (const [k, runs] of recent) {
        const live = runs.filter((t) => now - t < windowMs);
        if (live.length === 0) recent.delete(k);
        else recent.set(k, live);
      }
      const runs = recent.get(key) ?? [];
      if (runs.length >= max) return false;
      recent.set(key, [...runs, now]);
      return true;
    },
    reset(): void {
      recent.clear();
    },
  };
}
