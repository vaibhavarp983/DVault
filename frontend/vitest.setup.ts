import '@testing-library/jest-dom/vitest'

if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'))
      reader.readAsArrayBuffer(this)
    })
  }
}

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:vitest-object-url'
}

if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => undefined
}
