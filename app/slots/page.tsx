"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import TopLogo from "@/containers/skinanalysis-home/Recommendations/TopLogo";
import { useCart } from "@/containers/skinanalysis-home/Recommendations/CartContext";
import CartProduct from "@/containers/skinanalysis-home/Recommendations/cartProduct";
import SlotsGrid, { SlotsGridSlot } from "@/components/slots/SlotsGrid";
import SlotAddToCartDialog, { SlotProduct } from "@/components/slots/SlotAddToCartDialog";
import ProductPrice from "@/containers/skinanalysis-home/Recommendations/components/ProductPrice";
import ActionButton from "@/components/ui/ActionButton";
import PageBackground from "@/components/ui/PageBackground";

type VendingSlot = {
  slot_id: number;
  product_id?: string;
  quantity: number;
  product_name?: string;
  category?: string;
  retail_price?: number;
  image_url?: string;
  discount_value?: number;
};

const normalizeProductId = (id: unknown) => {
  const raw = String(id ?? "").trim();
  if (!raw) return "";
  const numericMatch = raw.match(/(\d{5,})\/?$/);
  if (numericMatch?.[1]) return numericMatch[1];
  return raw.replace(/^products\//, "");
};

export default function SlotsPage() {
  const router = useRouter();
  const { count: cartCount } = useCart();

  const [openCart, setOpenCart] = useState(false);
  const [slotsData, setSlotsData] = useState<Record<number, VendingSlot>>({});
  const [productsMap, setProductsMap] = useState<Record<string, any>>({});
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [hasBackfilled, setHasBackfilled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!addDialogOpen || !selectedSlotId) return;
      const slot = slotsData[selectedSlotId];
      if (!slot?.product_id) return;
      if (typeof slot.image_url === "string" && slot.image_url.trim()) return;

      const slotName = String(slot.product_name || "").trim();
      if (!slotName) return;

      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("limit", "50");
        params.set("search", slotName);

        const res = await fetch(`/api/admin/products?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;

        const arr: any[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.data?.[0]?.products)
              ? json.data[0].products
              : [];

        const rawSlotProductId = String(slot.product_id);
        const nId = normalizeProductId(rawSlotProductId);

        const match =
          arr.find((p) => normalizeProductId(p?.id ?? p?._id) === nId) ||
          arr.find((p) => String(p?.id ?? p?._id) === rawSlotProductId) ||
          arr.find((p) => String(p?.name ?? "").toUpperCase().includes(slotName.toUpperCase().substring(0, 15)));

        const imageUrlCandidate =
          match?.image_url ||
          match?.images?.[0]?.url ||
          match?.imageUrl ||
          match?.images?.[0] ||
          "";
        const image_url = typeof imageUrlCandidate === "string" ? imageUrlCandidate.trim() : "";
        if (!image_url) return;

        await fetch("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slot_id: selectedSlotId,
            product_id: slot.product_id,
            quantity: slot.quantity,
            product_name: slot.product_name,
            category: slot.category,
            retail_price: slot.retail_price,
            image_url,
          }),
        });

        if (cancelled) return;
        setSlotsData((prev) => {
          const cur = prev[selectedSlotId];
          if (!cur) return prev;
          return {
            ...prev,
            [selectedSlotId]: {
              ...cur,
              image_url,
            },
          };
        });
      } catch {
        return;
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [addDialogOpen, selectedSlotId, slotsData]);

  // Fetch slot assignments/quantity
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/admin/slots", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        const json = res.ok ? await res.json() : {};
        if (cancelled) return;

        const obj = (json && typeof json === "object") ? json : {};
        // API returns Record<number, VendingSlot>
        const next: Record<number, VendingSlot> = {};
        Object.values(obj as any).forEach((slot: any) => {
          if (!slot?.slot_id) return;
          next[Number(slot.slot_id)] = {
            slot_id: Number(slot.slot_id),
            product_id: slot.product_id ? String(slot.product_id) : undefined,
            quantity: Number(slot.quantity ?? 0),
            product_name: slot.product_name,
            category: slot.category,
            retail_price: slot.retail_price !== undefined ? Number(slot.retail_price) : undefined,
            image_url: slot.image_url ? String(slot.image_url) : undefined,
            discount_value: slot.discount_value !== undefined ? Number(slot.discount_value) : undefined,
          };
        });

        setSlotsData(next);
      } catch {
        if (!cancelled) setSlotsData({});
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Backfill logic: update slots missing discount_value from products map
  // Only runs once per page load to prevent infinite loops
  useEffect(() => {
    if (hasBackfilled) return;

    let cancelled = false;

    const run = async () => {
      if (Object.keys(productsMap).length === 0) return;

      const slotsNeedingDiscount: Record<number, { slot: VendingSlot; discount: number }> = {};

      Object.entries(slotsData).forEach(([slotIdStr, slot]) => {
        const slotId = Number(slotIdStr);
        if (!slot?.product_id) return;

        // Skip if slot already has discount_value
        if (slot.discount_value !== undefined && slot.discount_value !== null && slot.discount_value !== 0) return;

        const rawSlotProductId = String(slot.product_id);
        const nId = normalizeProductId(rawSlotProductId);
        const product = productsMap[nId] || productsMap[rawSlotProductId] || productsMap[normalizeProductId(rawSlotProductId)];

        if (!product) return;

        // Extract discount from product data (handle multiple shapes)
        const rawDiscount = product?.discount;
        const productDiscount = (() => {
          if (typeof rawDiscount === "number" && Number.isFinite(rawDiscount)) return rawDiscount;
          if (rawDiscount && typeof rawDiscount === "object") {
            const v = (rawDiscount as any).value ?? (rawDiscount as any).percentage ?? (rawDiscount as any).amount;
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
          }
          return 0;
        })();

        if (productDiscount > 0) {
          slotsNeedingDiscount[slotId] = { slot, discount: productDiscount };
        }
      });

      if (Object.keys(slotsNeedingDiscount).length === 0) {
        if (!cancelled) setHasBackfilled(true);
        return;
      }

      // Update slots with missing discount_value
      for (const [slotId, { slot, discount }] of Object.entries(slotsNeedingDiscount)) {
        if (cancelled) break;

        try {
          await fetch("/api/admin/slots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slot_id: Number(slotId),
              product_id: slot.product_id,
              quantity: slot.quantity,
              product_name: slot.product_name,
              category: slot.category,
              retail_price: slot.retail_price,
              image_url: slot.image_url,
              discount_value: discount,
            }),
          });
        } catch (e) {
          console.warn(`[Slots] Failed to backfill discount for slot ${slotId}:`, e);
        }
      }

      // Refresh slots data after backfill
      if (!cancelled) {
        try {
          const res = await fetch("/api/admin/slots", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
          });
          if (res.ok) {
            const json = await res.json();
            const obj = (json && typeof json === "object") ? json : {};
            const next: Record<number, VendingSlot> = {};
            Object.values(obj as any).forEach((slot: any) => {
              if (!slot?.slot_id) return;
              next[Number(slot.slot_id)] = {
                slot_id: Number(slot.slot_id),
                product_id: slot.product_id ? String(slot.product_id) : undefined,
                quantity: Number(slot.quantity ?? 0),
                product_name: slot.product_name,
                category: slot.category,
                retail_price: slot.retail_price !== undefined ? Number(slot.retail_price) : undefined,
                image_url: slot.image_url ? String(slot.image_url) : undefined,
                discount_value: slot.discount_value !== undefined ? Number(slot.discount_value) : undefined,
              };
            });
            setSlotsData(next);
          }
        } catch (e) {
          console.warn("[Slots] Failed to refresh slots after discount backfill:", e);
        }
        setHasBackfilled(true);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [slotsData, productsMap, hasBackfilled]);

  // Fetch products for mapping slot -> product image/discount/price
  // Removed hasBrand and isShopifyAvailable filters to retrieve all products with discount data
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("limit", "1000");

        const res = await fetch(`/api/admin/products?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!res.ok) {
          if (!cancelled) setProductsMap({});
          return;
        }

        const json = await res.json();
        if (cancelled) return;

        const arr: any[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.data?.[0]?.products)
              ? json.data[0].products
              : [];
        const map: Record<string, any> = {};
        arr.forEach((p) => {
          const rawId = p?.id ?? p?._id;
          const nId = normalizeProductId(rawId);
          if (rawId != null) map[String(rawId)] = p;
          if (nId) map[nId] = p;
        });

        setProductsMap(map);
      } catch {
        if (!cancelled) setProductsMap({});
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalSlots = 70;

  const gridSlots: SlotsGridSlot[] = useMemo(() => {
    return Array.from({ length: totalSlots }, (_, i) => {
      const slotId = i + 1;
      const slot = slotsData[slotId];
      const isAvailable = Boolean(slot?.product_id) && (slot?.quantity ?? 0) > 0;
      return {
        slotId,
        isAvailable,
        isSelected: selectedSlotId === slotId,
        quantity: slot?.quantity,
      };
    });
  }, [selectedSlotId, slotsData]);

  const { items } = useCart();

  const totalValue = useMemo(() => {
    return items.reduce((sum, item) => {
      // Extract price from priceText if available
      const priceMatch = item.priceText?.match(/INR\.?(\d+)/);
      const price = priceMatch ? Number(priceMatch[1]) : 0;
      return sum + (price * item.quantity);
    }, 0);
  }, [items]);

  const calculateDiscount = (total: number) => {
    if (!Number.isFinite(total) || total <= 0) return 0;
    return Math.min(120, Math.round(total)); // Max Rs.120 discount
  };

  const discount = useMemo(() => {
    return calculateDiscount(totalValue);
  }, [totalValue]);

  const selectedProduct: SlotProduct | null = useMemo(() => {
    if (!selectedSlotId) return null;
    const slot = slotsData[selectedSlotId];
    if (!slot?.product_id) return null;

    const rawSlotProductId = String(slot.product_id);
    const nId = normalizeProductId(rawSlotProductId);
    const productFromId =
      productsMap[nId] ||
      productsMap[rawSlotProductId] ||
      productsMap[normalizeProductId(rawSlotProductId)];

    const productFromName = (() => {
      const slotName = (slot.product_name || "").toString().trim();
      if (!slotName) return undefined;
      const slotUpper = slotName.toUpperCase();
      const slotPrefix = slotUpper.substring(0, 15);

      const values = Object.values(productsMap);
      return values.find((p: any) => {
        const pName = (p?.name || "").toString().trim();
        if (!pName) return false;
        const pUpper = pName.toUpperCase();
        const pPrefix = pUpper.substring(0, 15);
        return pUpper.includes(slotPrefix) || slotUpper.includes(pPrefix);
      });
    })();

    const product = productFromId || productFromName;

    const name = product?.name || slot.product_name || "Product";
    const imageUrlRaw =
      slot.image_url ||
      product?.images?.[0]?.url ||
      product?.image_url ||
      product?.imageUrl ||
      product?.images?.[0] ||
      "";
    const imageUrl = typeof imageUrlRaw === "string" ? imageUrlRaw : "";
    const retailPrice = product?.retail_price ?? slot.retail_price;

    // Get discount from slot.discount_value (database) first, then fallback to product.discount
    const slotDiscount = slot.discount_value !== undefined ? Number(slot.discount_value) : 0;
    const rawDiscount = product?.discount;
    const productDiscount = (() => {
      if (typeof rawDiscount === "number" && Number.isFinite(rawDiscount)) return rawDiscount;
      if (rawDiscount && typeof rawDiscount === "object") {
        const v = (rawDiscount as any).value ?? (rawDiscount as any).percentage ?? (rawDiscount as any).amount;
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    })();

    // Prioritize slot discount (from database) over product discount (from external API)
    const finalDiscount = slotDiscount > 0 ? slotDiscount : productDiscount;

    // Log for debugging
    if (selectedSlotId) {
      console.log(`[Slots] Slot ${selectedSlotId} - slot discount: ${slotDiscount}, product discount: ${productDiscount}, final: ${finalDiscount}`);
    }

    // Calculate discounted priceText for cart
    const discountedPrice = finalDiscount > 0
      ? Number(retailPrice ?? 0) - (Number(retailPrice ?? 0) * (finalDiscount / 100))
      : Number(retailPrice ?? 0);
    const priceText = `INR.${Math.round(discountedPrice)}/-`;

    return {
      id: product?.id ? String(product.id) : slot.product_id,
      name,
      imageUrl,
      retailPrice: Number(retailPrice ?? 0),
      discountValue: finalDiscount,
      priceText,
      slotId: selectedSlotId,
      quantityAvailable: slot.quantity,
    };
  }, [selectedSlotId, slotsData, productsMap]);

  const handleSelect = (slotId: number) => {
    const slot = slotsData[slotId];
    const isAvailable = Boolean(slot?.product_id) && (slot?.quantity ?? 0) > 0;
    if (!isAvailable) return;
    setSelectedSlotId(slotId);
    setAddDialogOpen(true);
  };

  return (
    <PageBackground>
      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <TopLogo
          isKiosk={false}
          cartCount={cartCount}
          onCartClick={() => setOpenCart(true)}
          onScanAgainClick={() => router.push("/")}
          firstButtonLabel="My cart"
          secondButtonLabel="Back"
          secondButtonIcon="/icons/face.png"
        />

        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            maxWidth: 920,
            mx: "auto",
            pt: 14,
            px: { xs: 2, sm: 3, md: 4 },
            pb: 4,
          }}
        >
          <Typography
            sx={{
              textAlign: "center",
              fontSize: 28,
              fontWeight: 800,
              color: "#111827",
              mb: 5,
            }}
          >
            SELECT PRODUCT SLOT
          </Typography>

          <Box
            sx={{
              backgroundColor: "#ffffff",
              borderRadius: 3,
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
              p: { xs: 3, sm: 2.5, md: 3 },
              minHeight: { xs: "calc(80vh - 200px)", sm: "calc(80vh - 260px)" },
              display: "flex",
              flexDirection: "column",
            }}
          >
            <SlotsGrid slots={gridSlots} columns={10} onSelect={handleSelect} />
{/* 
            <Typography sx={{ textAlign: "center", mt: 2, fontSize: 16, color: "#111827" }}>
              {selectedSlotId ? "1 Slot selected" : ""}
            </Typography>

            {selectedProduct && (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                <ProductPrice
                  retailPrice={selectedProduct.retailPrice}
                  discountValue={selectedProduct.discountValue}
                  priceText={selectedProduct.priceText}
                  productId={selectedProduct.id}
                  productName={selectedProduct.name}
                />
              </Box>
            )} */}

            <Box sx={{ display: "flex", justifyContent: "center", mt: "auto", pt: 2 }}>
              <ActionButton
                variant="primary"
                onClick={() => setOpenCart(true)}
                sx={{ width: "min(520px, 100%)", height: 72, borderRadius: "64px", fontSize: 22 }}
              >
                SHOW CART
              </ActionButton>
            </Box>
          </Box>
        </Box>

        <SlotAddToCartDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          product={selectedProduct}
        />

        <CartProduct open={openCart} onClose={() => setOpenCart(false)} />
      </Box>
    </PageBackground>
  );
}
