# medNAMA — Logo & Favicon Design Specification

**Date:** 2026-07-22  
**Status:** Approved by User  
**Topic:** App Brand Logo & Favicon Assets Creation & Integration  

---

## 1. Executive Summary

medNAMA requires a dedicated, professional brand logo and favicon suite that reinforces its identity as a clinical-first Retrieval-Augmented Generation (RAG) platform and medical board practice environment. The design combines a rounded geometric medical cross with a modern EKG pulse rhythm line, styled using the application's clinical sky-blue (`#30c5ff`) and teal color palette.

---

## 2. Visual Symbol & Color System

- **Emblem Structure**: A rounded 3D-styled clinical cross intersected horizontally by a sharp, crisp EKG heartbeat rhythm line.
- **Color Gradients**:
  - Primary Sky Cyan: `#30c5ff`
  - Deep Teal Accent: `#0891b2`
  - Background Container: `#13151a` (Dark mode surface with 12px border-radius for app icons, transparent background for SVG favicons)
  - Glow Layer: `rgba(48, 197, 255, 0.25)`

---

## 3. Asset Specifications

| File Path | Format | Dimensions | Purpose |
| :--- | :--- | :--- | :--- |
| `frontend/public/icon.svg` | SVG | Vector | Primary Next.js favicon & header emblem |
| `frontend/public/favicon.ico` | ICO | 32x32 | Standard browser tab icon |
| `frontend/public/apple-touch-icon.png` | PNG | 180x180 | iOS & mobile home screen icon |
| `frontend/public/logo.png` | PNG | 1024x1024 | High-resolution AI-generated brand asset |

---

## 4. Technical Integration Plan

1. **`frontend/src/app/layout.tsx`**:
   Update `metadata` configuration to include full icon metadata:
   ```ts
   export const metadata: Metadata = {
     title: "medNAMA - Clinical Knowledge & Practice Assistant",
     description: "Evidence-based RAG platform & board exam practice system.",
     icons: {
       icon: [
         { url: "/favicon.ico" },
         { url: "/icon.svg", type: "image/svg+xml" },
       ],
       apple: "/apple-touch-icon.png",
     },
   };
   ```

2. **`frontend/src/components/layout/AppSidebar.tsx`**:
   Replace the placeholder icon in the sidebar header with an `<img>` tag or SVG component loading `/icon.svg` alongside the `medNAMA` brand title.

3. **`frontend/src/components/layout/AuthCard.tsx`**:
   Update the mobile brand header to feature the new `/icon.svg` logo badge.

---

## 5. Validation Criteria

- **Browser Tab Display**: Browsers correctly render the new `favicon.ico` / `icon.svg` in both dark and light OS modes.
- **Header Aesthetics**: The sidebar header renders the new medical cross emblem clearly without distortion or text misalignment.
- **Build Cleanliness**: `npm run build` compiles with 0 errors.
