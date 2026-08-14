import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { AppRouter } from '@/AppRouter';
import { WebsiteChatProvider } from '@/contexts/WebsiteChatContext';
import { lazy, Suspense } from 'react';

const WebsiteChatWidget = lazy(() => import('@/components/chat/WebsiteChatWidget'));

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <WebsiteChatProvider>
                <AppRouter />
                <Suspense fallback={null}><WebsiteChatWidget /></Suspense>
              </WebsiteChatProvider>
            </WouterRouter>
            <Toaster />
          </CartProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
