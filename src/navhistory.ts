/**
 * Back/forward navigation history for following links between documents
 * (browser-style). The current document is tracked implicitly; every load
 * is a visit, going back/forward moves the pointer without recording a new
 * visit. Pure so it is unit-testable.
 */
export class NavigationHistory {
  private backStack: string[] = [];
  private forwardStack: string[] = [];
  private current: string | null = null;

  get canGoBack(): boolean {
    return this.backStack.length > 0;
  }

  get canGoForward(): boolean {
    return this.forwardStack.length > 0;
  }

  /** The path going back would land on (without mutating). */
  peekBack(): string | null {
    return this.backStack[this.backStack.length - 1] ?? null;
  }

  /** The path going forward would land on (without mutating). */
  peekForward(): string | null {
    return this.forwardStack[this.forwardStack.length - 1] ?? null;
  }

  /** Record a navigation to `path` (clears the forward stack). */
  visit(path: string): void {
    if (this.current !== null && this.current !== path) {
      this.backStack.push(this.current);
      this.forwardStack = [];
    }
    this.current = path;
  }

  /** Move back one entry and return the path to open (null when empty). */
  goBack(): string | null {
    const prev = this.backStack.pop();
    if (prev === undefined) return null;
    if (this.current !== null) this.forwardStack.push(this.current);
    this.current = prev;
    return prev;
  }

  /** Move forward one entry and return the path to open (null when empty). */
  goForward(): string | null {
    const next = this.forwardStack.pop();
    if (next === undefined) return null;
    if (this.current !== null) this.backStack.push(this.current);
    this.current = next;
    return next;
  }
}
