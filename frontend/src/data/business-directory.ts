import type { BizMessageType } from '@/domain/messaging'

export interface BizBusiness {
  code: string
  name: string
  category: string
  priceRange: string
  address: string
  directions: string
  tagline: string
  initials: string
  accentFrom: string
  accentTo: string
}

export const ARANYA_BUSINESS: BizBusiness = {
  code: 'BIZ-ARANYA',
  name: 'Aranya Coaching Centre',
  category: 'Education & coaching',
  priceRange: '₹4,000 – ₹18,000',
  address: '2nd Floor, Lakeview Plaza, Indiranagar, Bengaluru',
  directions: '6 min walk from Indiranagar metro',
  tagline: 'Small-batch coaching for school and competitive exams.',
  initials: 'AC',
  accentFrom: '#c19440',
  accentTo: '#8a6521',
}

export const BUSINESS_DIRECTORY: BizBusiness[] = [
  {
    code: 'BIZ-001',
    name: 'Blue Tokai Coffee Roasters',
    category: 'Cafe & coffee',
    priceRange: '₹250 – ₹700',
    address: '12 Church Street, Ashok Nagar, Bengaluru',
    directions: '3 min from MG Road metro',
    tagline: 'Single-origin coffee, brewed fresh every morning.',
    initials: 'BT',
    accentFrom: '#6f8f7a',
    accentTo: '#3f5f4c',
  },
  {
    code: 'BIZ-002',
    name: 'The Print Room',
    category: 'Printing & stationery',
    priceRange: '₹150 – ₹4,500',
    address: '44 Jayanagar 4th Block, Bengaluru',
    directions: 'Opposite Jayanagar bus stand',
    tagline: 'Same-day printing for documents, cards and banners.',
    initials: 'PR',
    accentFrom: '#7d8fa8',
    accentTo: '#4a5f78',
  },
  {
    code: 'BIZ-003',
    name: 'GreenLeaf Home Services',
    category: 'Home services',
    priceRange: '₹499 – ₹6,000',
    address: '18 HSR Layout Sector 2, Bengaluru',
    directions: 'Service available within 12 km',
    tagline: 'Cleaning, repairs and maintenance from verified pros.',
    initials: 'GL',
    accentFrom: '#77a88a',
    accentTo: '#3f7556',
  },
  {
    code: 'BIZ-004',
    name: 'Metro Auto Works',
    category: 'Automotive',
    priceRange: '₹800 – ₹22,000',
    address: '7 Industrial Layout, Koramangala, Bengaluru',
    directions: 'Next to Koramangala fire station',
    tagline: 'Trusted servicing for cars and two-wheelers.',
    initials: 'MA',
    accentFrom: '#8b8f96',
    accentTo: '#545b63',
  },
  {
    code: 'BIZ-005',
    name: 'Saffron Table',
    category: 'Restaurant',
    priceRange: '₹600 – ₹2,200',
    address: '31 Palace Road, Vasanth Nagar, Bengaluru',
    directions: '5 min from Cubbon Park metro',
    tagline: 'North Indian and Deccan favourites in a warm setting.',
    initials: 'ST',
    accentFrom: '#c4945f',
    accentTo: '#8e5c32',
  },
  {
    code: 'BIZ-006',
    name: 'Nimbus Event Rentals',
    category: 'Events & rentals',
    priceRange: '₹2,500 – ₹40,000',
    address: '9 Whitefield Main Road, Bengaluru',
    directions: 'Delivery available across east Bengaluru',
    tagline: 'Furniture, lighting and audio for small events.',
    initials: 'NE',
    accentFrom: '#8d82b0',
    accentTo: '#5b527d',
  },
  {
    code: 'BIZ-007',
    name: 'Studio Nine Design',
    category: 'Design studio',
    priceRange: '₹5,000 – ₹60,000',
    address: '5 Residency Road, Bengaluru',
    directions: 'Above the Residency Road bookshop',
    tagline: 'Brand identity, packaging and small-batch print design.',
    initials: 'S9',
    accentFrom: '#b08080',
    accentTo: '#7a5050',
  },
  {
    code: 'BIZ-008',
    name: 'Anand Diagnostics',
    category: 'Healthcare & diagnostics',
    priceRange: '₹350 – ₹4,800',
    address: '22 Malleshwaram 8th Cross, Bengaluru',
    directions: '10 min walk from Mantri Mall',
    tagline: 'Sample collection and diagnostic reports.',
    initials: 'AD',
    accentFrom: '#6f9ca8',
    accentTo: '#3f6b78',
  },
  {
    code: 'BIZ-009',
    name: 'Paper Trail Books',
    category: 'Bookstore',
    priceRange: '₹99 – ₹2,900',
    address: '3 Church Street, Bengaluru',
    directions: 'Beside the Church Street post office',
    tagline: 'Independent books, magazines and reading circles.',
    initials: 'PT',
    accentFrom: '#a88762',
    accentTo: '#745533',
  },
  {
    code: 'BIZ-010',
    name: 'SparkFit Studio',
    category: 'Fitness & wellness',
    priceRange: '₹1,200 – ₹9,000',
    address: '27 Indiranagar 100ft Road, Bengaluru',
    directions: '1 min from Indiranagar metro',
    tagline: 'Small-group strength, mobility and yoga classes.',
    initials: 'SF',
    accentFrom: '#c07f5c',
    accentTo: '#854d32',
  },
]

export const BUSINESS_ACCOUNTS: BizBusiness[] = [ARANYA_BUSINESS, ...BUSINESS_DIRECTORY]

export function normalizeBizCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

export function resolveBizCode(value: string | null | undefined): BizBusiness | null {
  const code = normalizeBizCode(value)
  if (!code) return null
  return BUSINESS_ACCOUNTS.find((business) => business.code === code) ?? null
}

export function businessForConversation(
  businessCode: string | undefined,
  businessName?: string,
): BizBusiness {
  return (
    resolveBizCode(businessCode) ??
    (businessName
      ? {
          ...ARANYA_BUSINESS,
          name: businessName,
          initials: businessName.slice(0, 2).toUpperCase(),
        }
      : ARANYA_BUSINESS)
  )
}

export const BIZ_MESSAGE_TEMPLATES: Record<
  BizMessageType,
  { label: string; subject: string; body: (businessName: string) => string }
> = {
  GENERAL_ENQUIRY: {
    label: 'General enquiry',
    subject: 'General enquiry',
    body: (businessName) =>
      `Hello ${businessName}, I have a general enquiry about your services.`,
  },
  QUOTE_REQUEST: {
    label: 'Quote request',
    subject: 'Quote request',
    body: (businessName) =>
      `Hello ${businessName}, could you please share a quote for my requirement?`,
  },
  PURCHASE_ORDER: {
    label: 'Purchase order',
    subject: 'Purchase order',
    body: (businessName) =>
      `Hello ${businessName}, I would like to place a purchase order. Please confirm availability and pricing.`,
  },
  INVOICE: {
    label: 'Invoice request',
    subject: 'Invoice request',
    body: (businessName) =>
      `Hello ${businessName}, could you please share the invoice for my recent order?`,
  },
  SUPPORT: {
    label: 'Support',
    subject: 'Support request',
    body: (businessName) =>
      `Hello ${businessName}, I need help with an existing order.`,
  },
}

export const BIZ_MESSAGE_TYPES: BizMessageType[] = [
  'GENERAL_ENQUIRY',
  'QUOTE_REQUEST',
  'PURCHASE_ORDER',
  'INVOICE',
  'SUPPORT',
]
