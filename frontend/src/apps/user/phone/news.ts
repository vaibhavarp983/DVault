export type NewsItem = {
  id: string
  category: 'Local' | 'Food' | 'Health' | 'Culture' | 'Auto' | 'Business'
  title: string
  summary: string
  meta: string
  image: string
}

export const news: NewsItem[] = [
  {
    id: 'news-food-walks',
    category: 'Local',
    title: 'Weekend food walks return to Church Street',
    summary: 'Twelve street kitchens, one evening route, and a lot of shared tables.',
    meta: '2h ago',
    image: '/news/food.jpg',
  },
  {
    id: 'news-clinic-hours',
    category: 'Health',
    title: 'Walk-in clinics add evening appointment slots',
    summary: 'Neighbourhood clinics are testing later hours to ease the post-work rush.',
    meta: '5h ago',
    image: '/news/clinic.jpg',
  },
  {
    id: 'news-reading-corners',
    category: 'Culture',
    title: 'Independent bookstores bet on quiet reading corners',
    summary: 'Cafés and bookshelves are sharing space as stores rethink footfall.',
    meta: 'Yesterday',
    image: '/news/bookstore.jpg',
  },
  {
    id: 'news-monsoon-checks',
    category: 'Auto',
    title: 'Monsoon vehicle checks local garages recommend',
    summary: 'Brake pads, wipers and a look at the wiring before the heavy rains.',
    meta: '2d ago',
    image: '/news/car.jpg',
  },
  {
    id: 'news-short-run-packaging',
    category: 'Business',
    title: 'Small brands order shorter, bolder print runs',
    summary: 'Design studios report demand for packaging that changes with the season.',
    meta: '3d ago',
    image: '/news/design.jpg',
  },
]
