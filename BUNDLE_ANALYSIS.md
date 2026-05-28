Bundle analysis instructions

1) Install deps (locally) and run baseline analysis:

```bash
# install deps (only when you choose to run the build locally)
npm install

# baseline build with analyzer
ANALYZE=true npm run build
```

2) After baseline capture, pull latest changes (these include dynamic imports for heavy components):

- Charts have been moved into a client-only `components/analytics/Charts.tsx` and are dynamically imported in `app/analytics/page.tsx`.
- `WalletConnectModal` is dynamically imported in `app/providers.tsx` (client-only).
- `DataTable` is dynamically imported in dashboard pages (`app/dashboard/*/page.tsx`).
- `useBreakpoint` and `Container` were added at `components/layout/`.
- `invoiceStore` now supports optimistic funding updates and rollback via `updateInvoiceFunding` and `rollbackInvoiceFunding`.
- Theme support extended to `light|dark|system` and `ThemeProvider` now listens to system preference.

3) Re-run analysis after changes:

```bash
ANALYZE=true npm run build
```

4) Compare reports: Next's bundle analyzer will open a report or place static files in `.next/analyze` (depending on config). Compare pre/post `initial` or `commons` bundle sizes — target is to reduce initial JS bundle under ~200KB gzipped.

Notes:
- I did not run or install dependencies here (per request). To generate the actual before/after numbers, run the commands above locally.
- If you want, I can add `@next/bundle-analyzer` config to `next.config.js` and a small script to make the analysis easier — tell me to proceed and I'll patch it in.
