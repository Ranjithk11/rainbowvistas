"use client";

// Previous Leaf Water landing imports kept for easy restore:
// import { LandingTopSection, PageBackground } from "@/components/ui";
// import { useRouter } from "next/navigation";
import NewPromoLanding from "./NewPromoLanding";

export default function LandingPage() {
  return (
    <>
      <NewPromoLanding />
      {/* Hidden previous landing — do not delete
      const router = useRouter();
      const handleStartScan = () => router.push("/questionnaire");
      const handleBrowseProducts = () => router.push("/products");
      const handleSlots = () => router.push("/slots");
      const handleAdminDashboard = () => router.push("/admin/login");

      <PageBackground showGreenCurve>
        <LandingTopSection
          onStartScan={handleStartScan}
          onBrowseProducts={handleBrowseProducts}
          onSlots={handleSlots}
          onAdminDashboard={handleAdminDashboard}
        />
      </PageBackground>
      */}
    </>
  );
}
