import { afterEach, describe, expect, it, vi } from 'vitest'
import { TemporaryDataManager } from './temporary-data-manager'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TemporaryDataManager', () => {
  it('revokes object URLs and runs cleanups on dispose', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const manager = new TemporaryDataManager()
    manager.registerObjectUrl('blob:one')
    manager.registerObjectUrl('blob:two')
    const cleanup = vi.fn()
    manager.registerCleanup(cleanup)

    manager.dispose()

    expect(revoke).toHaveBeenCalledWith('blob:one')
    expect(revoke).toHaveBeenCalledWith('blob:two')
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(manager.isDisposed).toBe(true)
  })

  it('runs cleanups in reverse order and only once', () => {
    const order: string[] = []
    const manager = new TemporaryDataManager()
    manager.registerCleanup(() => order.push('first'))
    manager.registerCleanup(() => order.push('second'))
    manager.dispose()
    manager.dispose()
    expect(order).toEqual(['second', 'first'])
  })

  it('cancels scheduled work on dispose', () => {
    vi.useFakeTimers()
    const manager = new TemporaryDataManager()
    const callback = vi.fn()
    manager.schedule(callback, 1000)
    manager.dispose()
    vi.advanceTimersByTime(2000)
    expect(callback).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('executes cleanups immediately after disposal', () => {
    const manager = new TemporaryDataManager()
    manager.dispose()
    const cleanup = vi.fn()
    manager.registerCleanup(cleanup)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('revokes a URL registered after disposal instead of retaining it', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const manager = new TemporaryDataManager()
    manager.dispose()
    manager.registerObjectUrl('blob:late')
    expect(revoke).toHaveBeenCalledWith('blob:late')
  })
})
