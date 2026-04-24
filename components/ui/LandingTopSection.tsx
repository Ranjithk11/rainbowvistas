"use client";

import { useEffect } from "react";
import { Box, Typography } from "@mui/material";
import Image from "next/image";
import ActionButton from "./ActionButton";
import Logo from "./Logo";
import FeatureCard from "./FeatureCard";
import { useVoiceMessages } from "@/contexts/VoiceContext";

interface LandingTopSectionProps {
  onStartScan: () => void;
  onBrowseProducts?: () => void;
  onSlots?: () => void;
  onAdminDashboard?: () => void;
}

export default function LandingTopSection({
  onStartScan,
  onBrowseProducts,
  onSlots,
  onAdminDashboard,
}: LandingTopSectionProps) {
  const { speakMessage, speakSequence } = useVoiceMessages();

  useEffect(() => {
    const t = window.setTimeout(() => {
      speakSequence(["welcome", "homeStartScan"]);
    }, 500);

    return () => window.clearTimeout(t);
  }, [speakSequence]);

  const handleStartScanWithVoice = () => {
    speakMessage("questionnaireIntro");
    onStartScan();
  };
  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        px: { xs: 3, sm: 4, md: 6 },
        pt: { xs: 4, sm: 3, md: 3.5 },
        pb: { xs: 2, sm: 3, md: 4 },
        maxWidth: { xs: "100%", sm: "900px", md: "1080px" },
        mx: "auto",
        width: "100%",
        height: "100dvh",
        overflowY: "auto",
      }}
    >
      <Logo header onBrowseProducts={onBrowseProducts} onSlots={onSlots} />

      <Box sx={{ mb: 5, mt: 5 }}>
        <Typography
          sx={{
            fontWeight: 700,
            color: "#000000",
            lineHeight: "1.2",
            fontSize: "60px",
            fontStyle: "normal",
            letterSpacing: 0,
            borderRadius: 1,
          }}
        >
          Ready to transform <br /> your skin with <span style={{ color: "#0d3fe6ff" }}>AI</span>? Scan Now.
        </Typography>
        <Typography
          sx={{
            fontWeight: 600,
            color: "#4a4a4a",
            lineHeight: "100%",
            fontSize: "40px",
            fontStyle: "normal",
            letterSpacing: 0,
            mt: 2,
          }}
        >
          Discover personalized skincare recommendations powered by AI technology
        </Typography>
      </Box>

      <ActionButton
        variant="primary"
        fullWidth
        icon={
          <Box
            component="img"
            src="/wending/scanlogo.svg"
            alt="Scan"
            sx={{ width: 60, height: 60, display: "block" }}
          />
        }
        sx={{
          mt: 2,
          height: "auto",
          fontSize: "40px",
          borderRadius: "16px",
          gap: "0px",
        }}
        onClick={handleStartScanWithVoice}
      >
        <Typography
          sx={{
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: "40px",
            lineHeight: "100%",
            letterSpacing: 0,
            textAlign: "center",
            width: "100%",
          }}
        >
          Start AI Skin Scan
        </Typography>
      </ActionButton>
      <Box
        sx={{
          position: "relative",
          width: "min(900px, 100%)",
          maxWidth: "100%",
          mx: "auto",
          flex: 1,
          minHeight: { xs: 250, md: 250 },
          opacity: 1,
        }}
      >
        <Image
          src="/wending/img.svg"
          alt="Woman applying skincare"
          fill
          style={{ objectFit: "contain", objectPosition: "bottom center" }}
          priority
          sizes="(max-width: 800px) 100vw, 800px"
        />
      </Box>
      <Box sx={{ mt: { xs: 2, md: 3 } }}>
        <FeatureCard
          label="LEARN MORE"
          title="AI Powered Analysis"
          description="Deep insights into your skin, powered by intelligent diagnostics."
        />
      </Box>

      {onAdminDashboard && (
        <Typography
          onClick={onAdminDashboard}
          sx={{
            color: "#2d5a3d",
            fontSize: 28,
            fontWeight: 400,
            textDecoration: "underline",
            cursor: "pointer",
            textAlign: "right",
            mt: 2,
            "&:hover": {
              color: "#1a3d28",
            },
          }}
        >
          Admin Dashboard
        </Typography>
      )}
    </Box>
  );
}
