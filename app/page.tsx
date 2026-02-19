import {Suspense} from 'react'
import LoginPage from '@/components/Login'

export default function Home(){
  return(
    <Suspense fallback={<div>Cargando...</div>}>
      <LoginPage />
    </Suspense>
  )
}