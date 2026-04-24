"use client";

import { Box, Typography } from "@mui/material";
import Image from "next/image";

interface FeatureCardProps {
  label: string;
  title: string;
  description: string;
  qrCodeSrc?: string;
  activeIndex?: number;
  totalDots?: number;
  qrBoxWidth?: number;
  qrBoxHeight?: number;
  qrBoxTop?: number | string;
  qrBoxRight?: number;
  qrBoxBorderRadius?: number;
  qrBoxCenterY?: boolean;
}

export default function FeatureCard({
  label,
  title,
  description,
  qrCodeSrc = "/products/vendingQr.jpeg",
  activeIndex = 0,
  totalDots = 3,
  qrBoxWidth = 160,
  qrBoxHeight = 160,
  qrBoxTop = "50%",
  qrBoxRight = 16,
  qrBoxBorderRadius = 12,
  qrBoxCenterY = true,
}: FeatureCardProps) {
  return (
    <Box
      sx={{
        bgcolor: "#2d5a3d",
        borderRadius: { xs: 3, sm: 4 },
        p: { xs: 2, sm: 3 },
        pr: { xs: `${qrBoxWidth + 28}px`, sm: `${qrBoxWidth + 36}px` },
        color: "white",
        position: "relative",
        overflow: "visible",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        <Typography
          sx={{
            color: "#FFFFFF",
            fontWeight: 200,
            fontStyle: "normal",
            fontSize: 40,
            lineHeight: "100%",
            letterSpacing: 0,
            textTransform: "uppercase",
            mb: 0.5,
            display: "block",
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            fontWeight: 300,
            fontStyle: "normal",
            fontSize: 40,
            lineHeight: "100%",
            letterSpacing: 0,
            mb: 0.5,
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            color: "#FFFFFF",
            fontWeight: 200,
            fontStyle: "normal",
            fontSize: 24,
            lineHeight: "100%",
            letterSpacing: 0,
            maxWidth: "100%",
          }}
        >
          {description}
        </Typography>

        {/* Pagination dots */}
        <Box sx={{ display: "flex", gap: 0.75, mt: { xs: 1.5, sm: 2 } }}>
          {Array.from({ length: totalDots }).map((_, i) => (
            <Box
              key={i}
              sx={{
                width: { xs: 6, sm: 8 },
                height: { xs: 6, sm: 8 },
                borderRadius: "50%",
                bgcolor: i === activeIndex ? "white" : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </Box>
      </Box>

      {/* QR Code - Positioned at right, vertically centered */}
      <Box
        sx={{
          position: "absolute",
          right: qrBoxRight,
          top: qrBoxCenterY ? "50%" : qrBoxTop,
          transform: qrBoxCenterY ? "translateY(-50%)" : undefined,
          width: qrBoxWidth,
          height: qrBoxHeight,
          bgcolor: "white",
          borderRadius: `${qrBoxBorderRadius}px`,
          p: 1,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}
      >
        <Box
          component="img"
          src={qrCodeSrc}
          alt="QR Code"
          sx={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "contain",
          }}
        />
      </Box>
    </Box>
  );
}
