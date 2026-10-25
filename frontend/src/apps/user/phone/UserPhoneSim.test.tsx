import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { UserProvider } from '@/store/user-provider'
import { UserPhoneSim } from './UserPhoneSim'

function renderWithDeepLink(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UserProvider>
        <UserPhoneSim />
      </UserProvider>
    </MemoryRouter>,
  )
}

describe('phone business deep links', () => {
  it('opens a prefilled chat sheet for a directory business code', async () => {
    renderWithDeepLink('/user?app=chat&biz=BIZ-001&type=quote')
    expect(await screen.findByText('Chat with a business')).toBeInTheDocument()
    expect(screen.getByText('Blue Tokai Coffee Roasters')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/share a quote/i)).toBeInTheDocument()
  })

  it('opens the existing business thread when one already exists', async () => {
    renderWithDeepLink('/user?app=mail&biz=BIZ-ARANYA')
    expect(
      await screen.findByPlaceholderText(/Reply to Aranya Coaching Centre/i),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Aranya Coaching Centre').length).toBeGreaterThan(0)
  })
})
