import type { Loading } from "@/lib/types";

/** 137 What the first read has done so far, told to the loading screen as it happens. */
export class Progress {
  private state: Loading = { records: 0, files: 0 };
  private readonly listeners = new Set<(loading: Loading) => void>();

  listen(listener: (loading: Loading) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  engine(done: number, total: number | null) {
    this.set({ engine: { done, total } });
  }

  zones(done: number, total: number) {
    this.set({ zones: { done, total } });
  }

  record() {
    this.set({ records: this.state.records + 1 });
  }

  file() {
    this.set({ files: this.state.files + 1 });
  }

  private set(change: Partial<Loading>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener(this.state);
  }
}
