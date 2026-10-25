export class TemporaryDataManager {
  private objectUrls: string[] = []
  private cleanups: Array<() => void> = []
  private sensitiveValues: string[] = []
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private disposed = false

  get isDisposed(): boolean {
    return this.disposed
  }

  registerObjectUrl(url: string): string {
    if (this.disposed) {
      URL.revokeObjectURL(url)
      return url
    }
    this.objectUrls.push(url)
    return url
  }

  registerCleanup(cleanup: () => void): void {
    if (this.disposed) {
      cleanup()
      return
    }
    this.cleanups.push(cleanup)
  }

  schedule(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      if (!this.disposed) callback()
    }, delayMs)
    this.timers.add(timer)
    return timer
  }

  trackSensitive<T extends string>(value: T): T {
    if (this.disposed) return value
    this.sensitiveValues.push(value)
    return value
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const cleanup of this.cleanups.reverse()) {
      try {
        cleanup()
      } catch {
        // Cleanup must never surface sensitive values or block the rest of the cleanup.
      }
    }
    this.cleanups = []
    for (const url of this.objectUrls) URL.revokeObjectURL(url)
    this.objectUrls = []
    for (let index = 0; index < this.sensitiveValues.length; index += 1) {
      this.sensitiveValues[index] = ''
    }
    this.sensitiveValues = []
  }
}
