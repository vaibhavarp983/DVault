import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { setNameSafeEnabled } from '@/data/name-safe'
import { UserProvider } from '@/store/user-provider'
import { UserPhoneSim } from './UserPhoneSim'

beforeEach(() => {
  setNameSafeEnabled(false)
})

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

  it('opens the ID-proof attachment sheet from a business thread', async () => {
    renderWithDeepLink('/user?app=mail&biz=BIZ-ARANYA')
    await screen.findByPlaceholderText(/Reply to Aranya Coaching Centre/i)
    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }))
    expect(await screen.findByText('Share an ID proof')).toBeInTheDocument()
    expect(screen.getByText('Take a photo')).toBeInTheDocument()
    expect(screen.getByText('Upload an image')).toBeInTheDocument()
    expect(screen.getByText('Upload a PDF')).toBeInTheDocument()
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
    const body = screen.getByPlaceholderText(/Write your message/i) as HTMLTextAreaElement
    expect(body.value).toMatch(/general enquiry/i)
  })
})

describe('name safe', () => {
  it('enables protection from the profile and shows the business-facing code', async () => {
    renderWithDeepLink('/user')
    fireEvent.click(await screen.findByRole('button', { name: 'Open profile' }))

    const toggle = await screen.findByRole('switch', { name: 'Name Safe' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)

    expect(screen.getByRole('switch', { name: 'Name Safe' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByText('Businesses see')).toBeInTheDocument()
    expect(screen.getByText(/^CST-[A-Z0-9]{4}$/)).toBeInTheDocument()
  })
})
