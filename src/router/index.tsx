import { useEffect } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { GuestModalProvider } from '@/components/ui/GuestModal'
import { RouteErrorFallback } from '@/components/layout/ErrorBoundary'
import { Loader2 } from 'lucide-react'

// Layout
import AppShell from '@/components/layout/AppShell'

// Auth pages
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import VerifyOTPPage from '@/pages/auth/VerifyOTPPage'
import NewPasswordPage from '@/pages/auth/NewPasswordPage'

// App pages
import HomePage from '@/pages/home/HomePage'
import ProfilePage from '@/pages/profile/ProfilePage'
import PersonalInfoPage from '@/pages/profile/PersonalInfoPage'
import ChangeNamePage from '@/pages/profile/ChangeNamePage'
import ChangeEmailPage from '@/pages/profile/ChangeEmailPage'
import ChangePasswordPage from '@/pages/profile/ChangePasswordPage'
import ChangeLanguagePage from '@/pages/profile/ChangeLanguagePage'
import ConversationsPage from '@/pages/chat/ConversationsPage'
import ChatPage from '@/pages/chat/ChatPage'
import CouponsPage from '@/pages/coupons/CouponsPage'
import CouponDetailPage from '@/pages/coupons/CouponDetailPage'
import SubscriptionPage from '@/pages/subscription/SubscriptionPage'
import SavedCardsPage from '@/pages/payments/SavedCardsPage'
import CardDetailPage from '@/pages/payments/CardDetailPage'
import AddCardPage from '@/pages/payments/AddCardPage'
import FinancialPage from '@/pages/financial/FinancialPage'
import CreatorProfilePage from '@/pages/creator/CreatorProfilePage'
import ContentPage from '@/pages/creator/ContentPage'
import LivePage from '@/pages/creator/LivePage'
import NewCallPage from '@/pages/creator/NewCallPage'
import CallRoomPage from '@/pages/creator/CallRoomPage'
import CheckoutPage from '@/pages/payments/CheckoutPage'
import PurchasesPage from '@/pages/purchases/PurchasesPage'
import NotificationsPage from '@/pages/notifications/NotificationsPage'
import NotFoundPage from '@/pages/NotFoundPage'

/** Full-screen loading spinner shown while auth resolves */
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
      <Outlet />
    </GuestModalProvider>
  )
}

/** Allows access always — unauthenticated users are auto-set as guests */
function AuthGuard() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const session = useAuthStore((s) => s.session)
  const isGuest = useAuthStore((s) => s.isGuest)

  useEffect(() => {
    if (!isLoading && !session && !isGuest) {
      useAuthStore.getState().setGuest(true)
    }
  }, [isLoading, session, isGuest])

  if (isLoading) return <PageLoader />
  return <Outlet />
}

/** Redirects authenticated users away from login/forgot-password (guests can access) */
function GuestGuard() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const session = useAuthStore((s) => s.session)
  if (isLoading) return <PageLoader />
  if (session) return <Navigate to="/home" replace />
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
    errorElement: <RouteErrorFallback />,
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
