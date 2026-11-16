# TSF Sales Orders

A Vercel-ready Next.js dashboard for reviewing, filtering, editing, and manually syncing eligible TSF Sales Orders with the Google Sheet backend.

## What it does

- Reads the current monthly tab from the Google Sheet.
- Provides customer, Sales Order, mobile-number, and status filtering.
- Updates a selected order directly in the Google Sheet.
- Runs a manual ERP sync from the **Sync eligible orders** button.
- Applies the agreed filters: submitted orders, `External Order`, Industrial Estate or Gambheeram kitchens, Touchstone Foundation Visakhapatnam, and the excluded-customer list.
- Uses `no_of_pax` for Pax and rounds Total Amount to two decimals.

## Vercel setup

1. Create a Google Cloud service account and enable the Google Sheets API.
2. Share the target Google Sheet with the service-account email as an **Editor**.
3. Add the values from `.env.example` as Vercel environment variables. Keep `GOOGLE_PRIVATE_KEY`, `ERP_USER`, and `ERP_PASSWORD` private.
4. Deploy the repository to Vercel.

The UI makes the Google Sheet the single source of truth. No scheduled background sync is used.
