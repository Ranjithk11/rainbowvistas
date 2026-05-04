"use client";

import React from "react";
import { Box, Typography } from "@mui/material";

interface ProductPriceProps {
  retailPrice?: number;
  discountValue?: number;
  priceText?: string;
  productId?: string;
  productName?: string;
}

const calculateDiscount = (originalPrice?: number, discountPercentage?: number) => {
  // Explicitly convert to numbers to handle string inputs
  const price = Number(originalPrice ?? 0);
  const discount = Number(discountPercentage ?? 0);

  if (!Number.isFinite(price)) return undefined;
  if (!Number.isFinite(discount)) return price;
  // discountPercentage is a percentage (e.g., 10 for 10%)
  const discountedPrice = price - (price * (discount / 100));
  return Number(discountedPrice.toFixed(0));
};

const ProductPrice: React.FC<ProductPriceProps> = ({
  retailPrice,
  discountValue,
  priceText,
}) => {
  const finalDiscountValue = discountValue || 0;

  const hasDiscount =
    Number.isFinite(retailPrice as number) &&
    Number.isFinite(finalDiscountValue) &&
    finalDiscountValue > 0 &&
    calculateDiscount(retailPrice, finalDiscountValue) !== retailPrice;

  return (
    <Box sx={{ textAlign: "left" }}>
      {hasDiscount ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
          <Typography 
            sx={{ 
              textDecoration: "line-through",
              fontSize: "16px",
              color: "#6b7280",
              fontWeight: 800
            }} 
            variant="subtitle2"
          >
            INR.{retailPrice}/-
          </Typography>
          <Typography 
            variant="subtitle2" 
            color="#b91c1c" 
            sx={{ 
              fontSize: "24px",
              fontWeight: 800
            }}
          >
            INR.{calculateDiscount(retailPrice, finalDiscountValue)}/-
          </Typography>
        </Box>
      ) : (
        <Typography variant="subtitle1" color="#b91c1c" sx={{ fontWeight: 800, textAlign: "left", fontSize: "24px" }}>
          {priceText || `INR.${retailPrice}/-`}
        </Typography>
      )}

      {finalDiscountValue ? (
        <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary", textAlign: "left", fontSize: 24 }}>
          Discount: {finalDiscountValue}% off
        </Typography>
      ) : null}
    </Box>
  );
};

export default ProductPrice;
