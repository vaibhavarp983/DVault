import type { BizMessageType } from '@/domain/messaging'

export interface BizBusiness {
  code: string
  name: string
  category: string
  description: string
  address: string
  hours: string
  website: string
  email: string
  rating: number
  reviews: number
  directions?: string
  initials: string
  accentFrom: string
  accentTo: string
}

export const ARANYA_BUSINESS: BizBusiness = {
  code: 'BIZ-ARANYA',
  name: 'Aranya Coaching Centre',
  category: 'Education & coaching',
  description: 'Small-batch coaching for school and competitive exams.',
  address: '2nd Floor, Lakeview Plaza, Indiranagar, Bengaluru',
  hours: 'Mon–Sat · 9:00 am – 7:00 pm',
  website: 'aranyacoaching.example',
  email: 'hello@aranyacoaching.example',
  rating: 4.7,
  reviews: 126,
  directions: '6 min walk from Indiranagar metro',
  initials: 'AC',
  accentFrom: '#c19440',
  accentTo: '#8a6521',
}

export const BUSINESS_DIRECTORY: BizBusiness[] = [
  {
    code: 'BIZ-SWA001',
    name: 'Swaad Kitchen',
    category: 'Restaurant',
    description:
      'North Indian thalis, tandoori plates and weekend buffets in a family-run kitchen.',
    address: '14 Lake Road, Koramangala, Bengaluru 560034',
    hours: 'Tue–Sun · 11:30 am – 10:30 pm',
    website: 'swaadkitchen.example',
    email: 'hello@swaadkitchen.example',
    rating: 4.6,
    reviews: 284,
    initials: 'SK',
    accentFrom: '#c4945f',
    accentTo: '#8e5c32',
  },
  {
    code: 'BIZ-LOT002',
    name: 'Lotus Bloom Clinic',
    category: 'Healthcare',
    description:
      'Walk-in family clinic for general medicine, vaccinations and preventive health checks.',
    address: '3rd Floor, Orchid Plaza, Indiranagar, Bengaluru 560038',
    hours: 'Mon–Sat · 9:00 am – 7:00 pm',
    website: 'lotusbloomclinic.example',
    email: 'care@lotusbloomclinic.example',
    rating: 4.8,
    reviews: 176,
    initials: 'LB',
    accentFrom: '#6f9ca8',
    accentTo: '#3f6b78',
  },
  {
    code: 'BIZ-NIR003',
    name: 'Nirmal Auto Works',
    category: 'Automotive',
    description: 'Two-wheeler servicing, wheel alignment and pickup-and-drop repairs.',
    address: '27 Industrial Layout, Peenya, Bengaluru 560058',
    hours: 'Mon–Sat · 8:30 am – 6:30 pm',
    website: 'nirmalauto.example',
    email: 'service@nirmalauto.example',
    rating: 4.4,
    reviews: 391,
    initials: 'NA',
    accentFrom: '#8b8f96',
    accentTo: '#545b63',
  },
  {
    code: 'BIZ-PAP004',
    name: 'The Paper Nook',
    category: 'Bookstore',
    description:
      'Independent bookstore with new arrivals, second-hand finds and a quiet reading corner.',
    address: '9 Church Street, Ashok Nagar, Bengaluru 560001',
    hours: 'Daily · 10:00 am – 8:00 pm',
    website: 'papernook.example',
    email: 'hello@papernook.example',
    rating: 4.7,
    reviews: 219,
    initials: 'PN',
    accentFrom: '#a88762',
    accentTo: '#745533',
  },
  {
    code: 'BIZ-GLO005',
    name: 'Glow Point Salon',
    category: 'Beauty & Wellness',
    description: 'Unisex salon for haircuts, colour, bridal styling and skin treatments.',
    address: '52 MG Road, Shivajinagar, Bengaluru 560001',
    hours: 'Tue–Sun · 10:00 am – 8:30 pm',
    website: 'glowpointsalon.example',
    email: 'bookings@glowpointsalon.example',
    rating: 4.5,
    reviews: 308,
    initials: 'GP',
    accentFrom: '#b08080',
    accentTo: '#7a5050',
  },
  {
    code: 'BIZ-BYT006',
    name: 'Byte & Brew Cafe',
    category: 'Cafe',
    description:
      'Slow-brew coffee, all-day breakfast and laptop-friendly corners with fast Wi-Fi.',
    address: '6 Cross, HSR Layout, Bengaluru 560102',
    hours: 'Daily · 8:00 am – 11:00 pm',
    website: 'byteandbrew.example',
    email: 'hi@byteandbrew.example',
    rating: 4.3,
    reviews: 142,
    initials: 'BB',
    accentFrom: '#6f8f7a',
    accentTo: '#3f5f4c',
  },
  {
    code: 'BIZ-VER007',
    name: 'Verma Legal Associates',
    category: 'Legal Services',
    description:
      'Property documentation, family law consultations and small-business compliance support.',
    address: '18 Residency Road, Bengaluru 560025',
    hours: 'Mon–Fri · 10:00 am – 6:00 pm',
    website: 'vermalegal.example',
    email: 'office@vermalegal.example',
    rating: 4.2,
    reviews: 88,
    initials: 'VL',
    accentFrom: '#7d8fa8',
    accentTo: '#4a5f78',
  },
  {
    code: 'BIZ-GRE008',
    name: 'Green Basket Grocers',
    category: 'Grocery',
    description: 'Fresh produce, pantry staples and same-day neighbourhood delivery.',
    address: '41 Sarjapur Road, Bellandur, Bengaluru 560103',
    hours: 'Daily · 7:00 am – 10:00 pm',
    website: 'greenbasket.example',
    email: 'orders@greenbasket.example',
    rating: 4.1,
    reviews: 512,
    initials: 'GB',
    accentFrom: '#77a88a',
    accentTo: '#3f7556',
  },
  {
    code: 'BIZ-PIX009',
    name: 'PixelCraft Studio',
    category: 'Design & Print',
    description: 'Brand identity, packaging design and short-run digital printing.',
    address: '2nd Floor, Design Hub, Jayanagar, Bengaluru 560041',
    hours: 'Mon–Sat · 10:00 am – 7:00 pm',
    website: 'pixelcraft.example',
    email: 'studio@pixelcraft.example',
    rating: 4.6,
    reviews: 97,
    initials: 'PS',
    accentFrom: '#8d82b0',
    accentTo: '#5b527d',
  },
  {
    code: 'BIZ-SIL010',
    name: 'Silver Screen Fitness',
    category: 'Fitness',
    description:
      'Strength and conditioning gym with personal training and beginner-friendly batches.',
    address: '88 5th Block, Rajajinagar, Bengaluru 560010',
    hours: 'Mon–Sat · 5:30 am – 9:30 pm',
    website: 'silverscreenfit.example',
    email: 'train@silverscreenfit.example',
    rating: 4.4,
    reviews: 263,
    initials: 'SF',
    accentFrom: '#c07f5c',
    accentTo: '#854d32',
  },
]

export const BUSINESS_ACCOUNTS: BizBusiness[] = [ARANYA_BUSINESS, ...BUSINESS_DIRECTORY]

export function searchBusinesses(query: string): BizBusiness[] {
  const term = query.trim().toLowerCase()
  if (!term) return BUSINESS_DIRECTORY
  return BUSINESS_DIRECTORY.filter((business) =>
    [
      business.name,
      business.category,
      business.description,
      business.address,
      business.code,
    ].some((value) => value.toLowerCase().includes(term)),
  )
}

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
