"use client";

import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Products from "@/components/landing/Products";
import HowItWorks from "@/components/landing/HowItWorks";
import Governance from "@/components/landing/Governance";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-x-hidden grain-overlay font-syne">
      <div className="gradient-orb orb-1" />
      <div className="gradient-orb orb-2" />
      <div className="gradient-orb orb-3" />
      <div className="relative z-10">
        <Navbar />

        <main>
          <Hero />
          <Products />
          <HowItWorks />
          <Governance />
          <CTA />
        </main>

        <Footer />
      </div>
    </div>
  );
}
