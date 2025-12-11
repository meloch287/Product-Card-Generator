import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import PhotoEditorPage from "./pages/PhotoEditorPage";
import CardsPage from "./pages/CardsPage";
import NotFound from "./pages/NotFound";
import { useTabStore } from "./stores/tabStore";

const queryClient = new QueryClient();

function MainContent() {
  const { activeTab } = useTabStore();
  
  switch (activeTab) {
    case 'generator':
      return <Index />;
    case 'editor':
      return <PhotoEditorPage />;
    case 'cards':
      return <CardsPage />;
    default:
      return <Index />;
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainContent />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
