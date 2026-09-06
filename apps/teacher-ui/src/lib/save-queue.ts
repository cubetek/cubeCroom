/** Serial writes with revisions: an older save cannot replace a newer edit. */
export function createSaveQueue<T>(write: (value: T) => Promise<void>) {
  let latest: T;
  let revision = 0;
  let savedRevision = 0;
  let inFlight: Promise<void> | null = null;
  return {
    set(value: T) {
      latest = value;
      revision += 1;
    },
    get dirty() {
      return savedRevision < revision;
    },
    flush(): Promise<void> {
      if (inFlight) return inFlight;
      const run = async () => {
        while (savedRevision < revision) {
          const savingRevision = revision;
          await write(latest);
          savedRevision = savingRevision;
        }
      };
      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
