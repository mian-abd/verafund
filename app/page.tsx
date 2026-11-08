import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import LogoMarquee from "@/components/landing/LogoMarquee";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowItWorks from "@/components/landing/HowItWorks";
import IntegrationSection from "@/components/landing/IntegrationSection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";
import { getWorkspace } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; expired?: string }>;
}) {
  const { error, expired } = await searchParams;
  const workspaceId = await getWorkspaceId();
  // Anyone with a live workspace (demo or signed in) gets "Open dashboard" in the navbar.
  const hasWorkspace = workspaceId ? Boolean(await getWorkspace(workspaceId).catch(() => null)) : false;

  return (
    <div id="top" className="min-h-screen bg-background">
      <Navbar hasWorkspace={hasWorkspace} />
      <HeroSection error={error} expired={Boolean(expired)} />
      <LogoMarquee />
      <FeaturesSection />
      <HowItWorks />
      <IntegrationSection />
      <CTASection />
      <Footer />
    </div>
  );
}
