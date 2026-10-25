import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSeedData } from '../src/data/synthetic'
import { createUserSeed } from '../src/data/user-synthetic'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = resolve(root, 'backend', 'app', 'seed')
mkdirSync(outputDirectory, { recursive: true })

const business = createSeedData()
const user = createUserSeed()

writeFileSync(
  resolve(outputDirectory, 'business.json'),
  `${JSON.stringify(business, null, 2)}\n`,
  'utf8',
)
writeFileSync(
  resolve(outputDirectory, 'user.json'),
  `${JSON.stringify(user, null, 2)}\n`,
  'utf8',
)

console.log(
  `Exported ${business.documents.length} business records and ${user.documents.length} personal records to backend/app/seed`,
)
