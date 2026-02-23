import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { GuestModalProvider } from '@/components/ui/GuestModal'
import { Loader2 } from 'lucide-react'

// Layout (keep static — always needed)
import AppShell from '@/components/layout/AppShell'

// Auth pages (lazy)
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const VerifyOTPPage = lazy(() => import('@/pages/auth/VerifyOTPPage'))
const NewPasswordPage = lazy(() => import('@/pages/auth/NewPasswordPage'))

// App pages (lazy)
const HomePage = lazy(() => import('@/pages/home/HomePage'))
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'))
const PersonalInfoPage = lazy(() => import('@/pages/profile/PersonalInfoPage'))
const ChangeNamePage = lazy(() => import('@/pages/profile/ChangeNamePage'))
const ChangeEmailPage = lazy(() => import('@/pages/profile/ChangeEmailPage'))
const ChangePasswordPage = lazy(() => import('@/pages/profile/ChangePasswordPage'))
const ChangeLanguagePage = lazy(() => import('@/pages/profile/ChangeLanguagePage'))
const ConversationsPage = lazy(() => import('@/pages/chat/ConversationsPage'))
const ChatPage = lazy(() => import('@/pages/chat/ChatPage'))
const CouponsPage = lazy(() => import('@/pages/coupons/CouponsPage'))
const CouponDetailPage = lazy(() => import('@/pages/coupons/CouponDetailPage'))
const SubscriptionPage = lazy(() => import('@/pages/subscription/SubscriptionPage'))
const SavedCardsPage = lazy(() => import('@/pages/payments/SavedCardsPage'))
const CardDetailPage = lazy(() => import('@/pages/payments/CardDetailPage'))
const AddCardPage = lazy(() => import('@/pages/payments/AddCardPage'))
const FinancialPage = lazy(() => import('@/pages/financial/FinancialPage'))
const CreatorProfilePage = lazy(() => import('@/pages/creator/CreatorProfilePage'))
const ContentPage = lazy(() => import('@/pages/creator/ContentPage'))
const LivePage = lazy(() => import('@/pages/creator/LivePage'))
const NewCallPage = lazy(() => import('@/pages/creator/NewCallPage'))
const CallRoomPage = lazy(() => import('@/pages/creator/CallRoomPage'))
const CheckoutPage = lazy(() => import('@/pages/payments/CheckoutPage'))
const PurchasesPage = lazy(() => import('@/pages/purchases/PurchasesPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

/** Full-screen loading spinner shown while auth resolves or chunks load */
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[hsl(var(--background))]">
      <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--primary))]" />
    </div>
  )
}

/** Wraps all routes with providers that need router context */
function RootLayout() {
  return (
    <GuestModalProvider>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </GuestModalProvider>
  )
}

/** Allows access if user has a session OR is a guest */
function AuthGuard() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const session = useAuthStore((s) => s.session)
  const isGuest = useAuthStore((s) => s.isGuest)
  if (isLoading) return <PageLoader />
  if (!session && !isGuest) return <Navigate to="/login" replace />
  return <Outlet />
}

/** Redirects authenticated users and guests away from login/forgot-password */
function GuestGuard() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const session = useAuthStore((s) => s.session)
  const isGuest = useAuthStore((s) => s.isGuest)
  if (isLoading) return <PageLoader />
  if (session || isGuest) return <Navigate to="/home" replace />
  return <Outlet />
}

/** Allows guests and unauthenticated users to access /register, but redirects logged-in users */
function RegisterGuard() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const session = useAuthStore((s) => s.session)
  if (isLoading) return <PageLoader />
  if (session) return <Navigate to="/home" replace />
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <Navigate to="/home" replace />,
      },
      // Guest-only routes (login, forgot password, etc.)
      {
        element: <GuestGuard />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
          { path: '/verify-otp', element: <VerifyOTPPage /> },
          { path: '/new-password', element: <NewPasswordPage /> },
        ],
      },
      // Register: accessible by guests and unauthenticated, but not logged-in users
      {
        element: <RegisterGuard />,
        children: [
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      // Protected routes (session or guest)
      {
        element: <AuthGuard />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/home', element: <HomePage /> },
              { path: '/profile', element: <ProfilePage /> },
              { path: '/profile/info', element: <PersonalInfoPage /> },
              { path: '/profile/info/name', element: <ChangeNamePage /> },
              { path: '/profile/info/email', element: <ChangeEmailPage /> },
              { path: '/profile/info/password', element: <ChangePasswordPage /> },
              { path: '/profile/info/language', element: <ChangeLanguagePage /> },
              { path: '/chat', element: <ConversationsPage /> },
              { path: '/chat/:id', element: <ChatPage /> },
              { path: '/coupons', element: <CouponsPage /> },
              { path: '/coupons/:id', element: <CouponDetailPage /> },
              { path: '/subscription', element: <SubscriptionPage /> },
              { path: '/payments/cards', element: <SavedCardsPage /> },
              { path: '/payments/cards/new', element: <AddCardPage /> },
              { path: '/payments/cards/:id', element: <CardDetailPage /> },
              { path: '/financial', element: <FinancialPage /> },
              { path: '/creator/:profileId', element: <CreatorProfilePage /> },
              { path: '/creator/:creatorId/content', element: <ContentPage /> },
              { path: '/lives/:id', element: <LivePage /> },
              { path: '/calls/new', element: <NewCallPage /> },
              { path: '/calls/:id', element: <CallRoomPage /> },
              { path: '/payments/checkout', element: <CheckoutPage /> },
              { path: '/purchases', element: <PurchasesPage /> },
              { path: '/notifications', element: <NotificationsPage /> },
            ],
          },
        ],
      },
      // 404 catch-all
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
