import { fireEvent, render, screen } from '@testing-library/react'
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

async function openGoogleListing() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open Google' }))
  const search = await screen.findByLabelText('Search businesses')
  fireEvent.change(search, { target: { value: 'BIZ-SWA001' } })
  fireEvent.click(await screen.findByRole('button', { name: /Swaad Kitchen/ }))
}

describe('phone business deep links', () => {
  it('opens a prefilled chat sheet for a directory business code', async () => {
    renderWithDeepLink('/user?app=chat&biz=BIZ-SWA001&type=quote')
    expect(await screen.findByText('Chat with a business')).toBeInTheDocument()
    expect(screen.getByText('Swaad Kitchen')).toBeInTheDocument()
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

describe('google business integration', () => {
  it.each([
    ['Message', 'Chat with a business'],
    ['Email', 'Mail a business'],
  ])('opens a prefilled compose sheet from the %s action', async (action, title) => {
    renderWithDeepLink('/user')
    await openGoogleListing()
    fireEvent.click(screen.getByRole('button', { name: action }))
    expect(await screen.findByText(title)).toBeInTheDocument()
    const body = screen.getByPlaceholderText('Write your message…') as HTMLTextAreaElement
    expect(body.value).toMatch(/general enquiry/i)
  })
})
