export type Business = {
  bizCode: string
  name: string
  category: string
  description: string
  address: string
  hours: string
  website: string
  email: string
  rating: number
  reviews: number
}

export const businesses: Business[] = [
  {
    bizCode: 'BV-REST-1001',
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
  },
  {
    bizCode: 'BV-CLIN-2004',
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
  },
  {
    bizCode: 'BV-AUTO-3107',
    name: 'Nirmal Auto Works',
    category: 'Automotive',
    description: 'Two-wheeler servicing, wheel alignment and pickup-and-drop repairs.',
    address: '27 Industrial Layout, Peenya, Bengaluru 560058',
    hours: 'Mon–Sat · 8:30 am – 6:30 pm',
    website: 'nirmalauto.example',
    email: 'service@nirmalauto.example',
    rating: 4.4,
    reviews: 391,
  },
  {
    bizCode: 'BV-BOOK-4210',
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
  },
  {
    bizCode: 'BV-SALO-5322',
    name: 'Glow Point Salon',
    category: 'Beauty & Wellness',
    description: 'Unisex salon for haircuts, colour, bridal styling and skin treatments.',
    address: '52 MG Road, Shivajinagar, Bengaluru 560001',
    hours: 'Tue–Sun · 10:00 am – 8:30 pm',
    website: 'glowpointsalon.example',
    email: 'bookings@glowpointsalon.example',
    rating: 4.5,
    reviews: 308,
  },
  {
    bizCode: 'BV-CAFE-6431',
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
  },
  {
    bizCode: 'BV-LEGL-7544',
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
  },
  {
    bizCode: 'BV-GROC-8653',
    name: 'Green Basket Grocers',
    category: 'Grocery',
    description: 'Fresh produce, pantry staples and same-day neighbourhood delivery.',
    address: '41 Sarjapur Road, Bellandur, Bengaluru 560103',
    hours: 'Daily · 7:00 am – 10:00 pm',
    website: 'greenbasket.example',
    email: 'orders@greenbasket.example',
    rating: 4.1,
    reviews: 512,
  },
  {
    bizCode: 'BV-DSGN-9760',
    name: 'PixelCraft Studio',
    category: 'Design & Print',
    description: 'Brand identity, packaging design and short-run digital printing.',
    address: '2nd Floor, Design Hub, Jayanagar, Bengaluru 560041',
    hours: 'Mon–Sat · 10:00 am – 7:00 pm',
    website: 'pixelcraft.example',
    email: 'studio@pixelcraft.example',
    rating: 4.6,
    reviews: 97,
  },
  {
    bizCode: 'BV-FITN-1088',
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
  },
]

export function searchBusinesses(query: string): Business[] {
  const term = query.trim().toLowerCase()
  if (!term) return businesses
  return businesses.filter((business) =>
    [business.name, business.category, business.description, business.bizCode].some((value) =>
      value.toLowerCase().includes(term),
    ),
  )
}
