import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

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
import CheckoutPage from '@/pages/payments/CheckoutPage'
import PurchasesPage from '@/pages/purchases/PurchasesPage'
import NotificationsPage from '@/pages/notifications/NotificationsPage'

// Layout
import AppShell from '@/components/layout/AppShell'

function AuthGuard() {
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[hsl(var(--background))]">
        <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

function GuestGuard() {
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return null
  if (session) return <Navigate to="/home" replace />
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/home" replace />,
  },
  // Guest-only routes
  {
    element: <GuestGuard />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/verify-otp', element: <VerifyOTPPage /> },
      { path: '/new-password', element: <NewPasswordPage /> },
    ],
  },
  // Protected routes
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
          { path: '/payments/checkout', element: <CheckoutPage /> },
          { path: '/purchases', element: <PurchasesPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
        ],
      },
    ],
  },
])
