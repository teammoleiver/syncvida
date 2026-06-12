import { useEffect, useState, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import { getProfile } from "@/lib/supabase-queries";
import OnboardingWizard from "@/components/OnboardingWizard";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AssistantModule = lazy(() => import("./pages/AssistantModule"));
const SettingsModule = lazy(() => import("./pages/SettingsModule"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const ProjectsModule = lazy(() => import("./pages/ProjectsModule"));
const TasksModule = lazy(() => import("./pages/TasksModule"));
const CalendarModule = lazy(() => import("./pages/CalendarModule"));
const SocialMediaModule = lazy(() => import("./pages/SocialMediaModule"));
const SocialStudioLayout = lazy(() => import("./pages/social/SocialStudioLayout"));
const SocialOverview = lazy(() => import("./pages/social/SocialOverview"));
const CrmLayout = lazy(() => import("./pages/crm/CrmLayout"));
const CrmDashboard = lazy(() => import("./pages/crm/CrmDashboard"));
const ContactsPage = lazy(() => import("./pages/crm/ContactsPage"));
const CompaniesPage = lazy(() => import("./pages/crm/CompaniesPage"));
const DealsPage = lazy(() => import("./pages/crm/DealsPage"));
const PipelinesPage = lazy(() => import("./pages/crm/PipelinesPage"));
const NewsPage = lazy(() => import("./pages/social/NewsPage"));
const ContentPlannerPage = lazy(() => import("./pages/social/ContentPlannerPage"));
const SearchPage = lazy(() => import("./pages/social/SearchPage"));
const YouTubePage = lazy(() => import("./pages/social/YouTubePage"));
const ContentStudioPage = lazy(() => import("./pages/social/ContentStudioPage"));
const CarouselGenerator = lazy(() => import("./pages/CarouselGenerator"));
const CarouselHistory = lazy(() => import("./pages/CarouselHistory"));
const DesignerHome = lazy(() => import("./pages/designer/DesignerHome"));
const BrandKitPage = lazy(() => import("./pages/designer/BrandKitPage"));
const AssetLibraryPage = lazy(() => import("./pages/designer/AssetLibraryPage"));
const DesignEditor = lazy(() => import("./pages/designer/DesignEditor"));
const LinkedInTemplatesPage = lazy(() => import("./pages/designer/LinkedInTemplatesPage"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const LinkedInCallback = lazy(() => import("./pages/oauth/LinkedInCallback"));
const CanvaCallback = lazy(() => import("./pages/oauth/CanvaCallback"));
const MetaCallback = lazy(() => import("./pages/oauth/MetaCallback"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    getProfile().then((p: any) => {
      // New users go through onboarding until they complete it.
      setNeedsOnboarding(!p?.onboarded);
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
  return (
    <Suspense fallback={null}>
    <Routes>
      <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/linkedin/callback" element={<ProtectedRoute><LinkedInCallback /></ProtectedRoute>} />
      <Route path="/oauth/canva/callback" element={<ProtectedRoute><CanvaCallback /></ProtectedRoute>} />
      <Route path="/oauth/meta/callback" element={<ProtectedRoute><MetaCallback /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/crm" element={<ProtectedRoute><AppLayout><CrmLayout /></AppLayout></ProtectedRoute>}>
        <Route index element={<CrmDashboard />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="pipelines" element={<PipelinesPage />} />
      </Route>
      <Route path="/assistant" element={<ProtectedRoute><AppLayout><AssistantModule /></AppLayout></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><AppLayout><ProjectsModule /></AppLayout></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><AppLayout><TasksModule /></AppLayout></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><AppLayout><CalendarModule /></AppLayout></ProtectedRoute>} />
      <Route path="/social" element={<ProtectedRoute><AppLayout><SocialStudioLayout /></AppLayout></ProtectedRoute>}>
        <Route index element={<SocialOverview />} />
        <Route path="search" element={<SearchPage />} />
        {/* LinkedIn workspace — each sub-tab is its own URL: /social/linkedin/<tab> */}
        <Route path="linkedin" element={<Navigate to="/social/linkedin/profiles" replace />} />
        <Route path="linkedin/:tab" element={<SocialMediaModule hideHeader basePath="/social/linkedin" />} />
        <Route path="youtube" element={<YouTubePage />} />
        <Route path="news" element={<NewsPage />} />
        {/* Social Hub settings moved to the central Settings page. */}
        <Route path="settings" element={<Navigate to="/settings?tab=social" replace />} />
      </Route>
      <Route path="/content-studio" element={<ProtectedRoute><AppLayout><ContentStudioPage /></AppLayout></ProtectedRoute>} />
      <Route path="/content-planner" element={<ProtectedRoute><AppLayout><ContentPlannerPage /></AppLayout></ProtectedRoute>} />
      <Route path="/carousel-generator" element={<ProtectedRoute><AppLayout><CarouselGenerator /></AppLayout></ProtectedRoute>} />
      <Route path="/carousel-history" element={<ProtectedRoute><AppLayout><CarouselHistory /></AppLayout></ProtectedRoute>} />
      <Route path="/designer" element={<ProtectedRoute><AppLayout><DesignerHome /></AppLayout></ProtectedRoute>} />
      <Route path="/designer/brand" element={<ProtectedRoute><AppLayout><BrandKitPage /></AppLayout></ProtectedRoute>} />
      <Route path="/designer/assets" element={<ProtectedRoute><AppLayout><AssetLibraryPage /></AppLayout></ProtectedRoute>} />
      <Route path="/designer/linkedin-templates" element={<ProtectedRoute><AppLayout><LinkedInTemplatesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/designer/:id" element={<ProtectedRoute><AppLayout><DesignEditor /></AppLayout></ProtectedRoute>} />
      {/* Central settings hub — each tab is its own URL: /settings/<section>
          and /settings/social-hub/<sub>. /admin & /profile redirect in. */}
      <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
      <Route path="/settings/:section" element={<ProtectedRoute><AppLayout><AdminPanel /></AppLayout></ProtectedRoute>} />
      <Route path="/settings/:section/:sub" element={<ProtectedRoute><AppLayout><AdminPanel /></AppLayout></ProtectedRoute>} />
      <Route path="/admin" element={<Navigate to="/settings/profile" replace />} />
      <Route path="/profile" element={<Navigate to="/settings/profile" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
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
