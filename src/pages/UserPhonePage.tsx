import { UserPhoneSim } from '@/apps/user/phone/UserPhoneSim'
import { UserProvider } from '@/store/user-provider'

export function UserPhonePage() {
  return (
    <UserProvider>
      <UserPhoneSim />
    </UserProvider>
  )
}
