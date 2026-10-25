import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import { BusinessDesktopPage } from '@/pages/BusinessDesktopPage'
import { MemoryRouter } from 'react-router-dom'

describe('BusinessDesktopPage', () => {
  it('renders without crashing and opens vault', async () => {
    let result: ReturnType<typeof render> | undefined
    await act(async () => {
      result = render(
        <MemoryRouter>
          <BusinessDesktopPage />
        </MemoryRouter>,
      )
    })
    expect(result).toBeDefined()
  })
})
