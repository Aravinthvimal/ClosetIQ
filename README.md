# ClosetIQ

A personal wardrobe with a Three.js dressing room, garment photographs, outfits and a daily journal.

## Run

Requires Node.js. Run `node server.cjs` and open http://127.0.0.1:4173. Use an HTTP server rather than opening index.html directly: browser module workers need HTTP or HTTPS.

## Garment photographs

Select a category and upload a JPG, PNG or WebP (up to 20 MB). Images are resized to at most 1200 pixels and processed locally by `Xenova/segformer_b2_clothes` through Transformers.js in a Web Worker. The first extraction downloads model weights from Hugging Face and runtime files from jsDelivr; subsequent runs use the browser cache. The worker does not upload photographs to an inference service. Saving uses localStorage, or the existing configured Supabase database.

The model masks clothing labels rather than removing everything that matches the background color. Review the preview before saving. It can miss flat-lay garments, unusual cuts or occluded fabric. Multiple garments of the selected class are included together. Watches are not a supported segmentation label. Retry with another category/photo or explicitly use Keep original, which retains the background. Extraction failures never silently save an unprocessed photo.

## What the 3D viewer represents

The cabinet is actual 3D geometry: wood panels, recessed back, drawers, shelves, rail, lighting and shadows. Garments preserve the visible photograph on lightly curved meshes. This is a photo-based depth preview, **not a reconstructed 360-degree garment**. A single view cannot recover hidden fabric, precise dimensions or drape. Faithful full garment models require additional views, a reconstruction service or authored/scanned meshes; these are not implemented. Drag to adjust perspective, select a photo card or garment, and use Reset view to return to the front. Browsers without WebGL or CDN access retain the photo carousel.

The three starter pieces are clearly marked samples, with photos sourced from the Fake Store API product dataset (products 2–4). Existing user items are preserved and are not assigned unrelated sample images. No image-generation service is used.

## Storage and deployment

Existing localStorage data and Supabase configuration remain supported. Browser localStorage has a limited quota; save failures are reported and leave the edit open. For an existing Supabase database, apply `migrations/001-dress-category.sql` to permit the new dress category. New databases can use `supabase-schema.sql`.

Dependencies are pinned CDN imports: Three.js 0.170.0 and Transformers.js 3.8.1. Model and library downloads require network access. Review upstream licenses before redistribution. The included server is for local previews and binds only to 127.0.0.1.

References: [Three.js](https://threejs.org/manual/en/installation.html), [clothing segmentation model](https://huggingface.co/Xenova/segformer_b2_clothes).
