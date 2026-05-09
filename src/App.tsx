import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import { scheduleEndOfDaySnapshot, checkMissedSnapshot } from "@/lib/daily-snapshot";
import { getProfile } from "@/lib/supabase-queries";
import OnboardingWizard from "@/components/OnboardingWizard";
import Dashboard from "./pages/Dashboard";
import HealthRecords from "./pages/HealthRecords";
import FastingModule from "./pages/FastingModule";
import NutritionModule from "./pages/NutritionModule";
import ExerciseModule from "./pages/ExerciseModule";
import BodyMetrics from "./pages/BodyMetrics";
import GoalsModule from "./pages/GoalsModule";
import AssistantModule from "./pages/AssistantModule";
import SleepModule from "./pages/SleepModule";
import SettingsModule from "./pages/SettingsModule";
import AdminPanel from "./pages/AdminPanel";
import ProjectsModule from "./pages/ProjectsModule";
import TasksModule from "./pages/TasksModule";
import CalendarModule from "./pages/CalendarModule";
import SocialMediaModule from "./pages/SocialMediaModule";
import SocialStudioLayout from "./pages/social/SocialStudioLayout";
import SocialOverview from "./pages/social/SocialOverview";
import NewsPage from "./pages/social/NewsPage";
import ContentPlannerPage from "./pages/social/ContentPlannerPage";
import SearchPage from "./pages/social/SearchPage";
import ContentStudioPage from "./pages/social/ContentStudioPage";
import CarouselGenerator from "./pages/CarouselGenerator";
import CarouselHistory from "./pages/CarouselHistory";
import DesignerHome from "./pages/designer/DesignerHome";
import BrandKitPage from "./pages/designer/BrandKitPage";
import AssetLibraryPage from "./pages/designer/AssetLibraryPage";
import DesignEditor from "./pages/designer/DesignEditor";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import LinkedInCallback from "./pages/oauth/LinkedInCallback";
import CanvaCallback from "./pages/oauth/CanvaCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    getProfile().then((p: any) => {
      // If profile exists but has no height_cm set, show onboarding
      setNeedsOnboarding(!p?.height_cm);
    });
  }, [user]);

  if (loading || (user && needsOnboarding === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (needsOnboarding) {
    return (
      <OnboardingWizard
        onComplete={() => setNeedsOnboarding(false)}
        userName={user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0]}
      />
    );
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  useEffect(() => {
    scheduleEndOfDaySnapshot();
    checkMissedSnapshot();
  }, []);

  return (
    <Routes>
      <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/linkedin/callback" element={<ProtectedRoute><LinkedInCallback /></ProtectedRoute>} />
      <Route path="/oauth/canva/callback" element={<ProtectedRoute><CanvaCallback /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/health" element={<ProtectedRoute><AppLayout><HealthRecords /></AppLayout></ProtectedRoute>} />
      <Route path="/fasting" element={<ProtectedRoute><AppLayout><FastingModule /></AppLayout></ProtectedRoute>} />
      <Route path="/nutrition" element={<ProtectedRoute><AppLayout><NutritionModule /></AppLayout></ProtectedRoute>} />
      <Route path="/exercise" element={<ProtectedRoute><AppLayout><ExerciseModule /></AppLayout></ProtectedRoute>} />
      <Route path="/body" element={<ProtectedRoute><AppLayout><BodyMetrics /></AppLayout></ProtectedRoute>} />
      <Route path="/sleep" element={<ProtectedRoute><AppLayout><SleepModule /></AppLayout></ProtectedRoute>} />
      <Route path="/goals" element={<ProtectedRoute><AppLayout><GoalsModule /></AppLayout></ProtectedRoute>} />
      <Route path="/assistant" element={<ProtectedRoute><AppLayout><AssistantModule /></AppLayout></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><AppLayout><ProjectsModule /></AppLayout></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><AppLayout><TasksModule /></AppLayout></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><AppLayout><CalendarModule /></AppLayout></ProtectedRoute>} />
      <Route path="/social" element={<ProtectedRoute><AppLayout><SocialStudioLayout /></AppLayout></ProtectedRoute>}>
        <Route index element={<SocialOverview />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="linkedin" element={<SocialMediaModule defaultTab="profiles" hideHeader />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="settings" element={<SocialMediaModule defaultTab="settings" hideHeader />} />
      </Route>
      <Route path="/content-studio" element={<ProtectedRoute><AppLayout><ContentStudioPage /></AppLayout></ProtectedRoute>} />
      <Route path="/content-planner" element={<ProtectedRoute><AppLayout><ContentPlannerPage /></AppLayout></ProtectedRoute>} />
      <Route path="/carousel-generator" element={<ProtectedRoute><AppLayout><CarouselGenerator /></AppLayout></ProtectedRoute>} />
      <Route path="/carousel-history" element={<ProtectedRoute><AppLayout><CarouselHistory /></AppLayout></ProtectedRoute>} />
      <Route path="/designer" element={<ProtectedRoute><AppLayout><DesignerHome /></AppLayout></ProtectedRoute>} />
      <Route path="/designer/brand" element={<ProtectedRoute><AppLayout><BrandKitPage /></AppLayout></ProtectedRoute>} />
      <Route path="/designer/assets" element={<ProtectedRoute><AppLayout><AssetLibraryPage /></AppLayout></ProtectedRoute>} />
      <Route path="/designer/:id" element={<ProtectedRoute><AppLayout><DesignEditor /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsModule /></AppLayout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AppLayout><AdminPanel /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
