# Use recorded sales while forecasting needs more history

Owners and Super Admins can open **Demand planning → Recorded sales** to review quantities already saved in PartCast. This view works even when Python is unavailable or the XGBoost history checks do not pass.

1. Import the prepared actual sales-quantity history, or record sales through **Sell or receive**.
2. Open **Demand planning** and review **Recorded sales** at the top.
3. Choose a date range and click **Show recorded sales**, or choose **All saved dates**. Both date endpoints are included, using the store's Philippine calendar dates.
4. Search for a part. Its recorded quantity, distinct recorded sale days, first/latest sale dates and counts of counter/imported records are shown. Quantities with different units are not combined into a store-wide units total.
5. Use **Review stock levels** to check the saved inventory. Restocking can use the low-stock and reserve quantities entered by the owner. Keep recording each actual sale to build history for later model validation.

These are historical totals. The view does not predict future sales, infer quantities from invoice amounts, fill missing days with zero sales, create sales, change dates or calculate forecast accuracy. An empty period means no quantities were recorded in that period; it does not establish that no sales occurred. Owner-confirmed imported quantities retain their attribution in the source import files.

Only `actual_sale` and `imported_training_data` observations are included. Transaction-count proxies and simulated demonstration records are excluded. Invalid quantities/dates and future-dated rows are excluded from totals and counted in a visible review message. The summary preserves source rows and does not write products, history, forecast runs or models.

The last successfully loaded version of each date range can be viewed offline under the existing verified-account cache rules. A visible saved-copy timestamp identifies cached information. A date range that has never been loaded needs an internet connection.

XGBoost training, its existing history checks and the labelled simulation panel remain available separately. This feature does not make an incomplete dataset forecast-ready or establish actual-store accuracy. With the supplied owner-confirmed import, the recorded-sales summary contains 34 observations for 20 parts; the actual forecasting readiness check still finds no current eligible parts.

## Deployment and validation

Deploy the API and website from the same commit, preferably API first, then refresh PartCast. No Supabase migration, reset or new API key is required. The new authenticated `GET /api/forecast/recorded-sales` endpoint requires a verified Owner/Admin/Super Admin account and never starts Python. Cashiers remain limited to their existing pages.

Validation covers exact fractional totals, source filtering, distinct sale days, inclusive date filters, empty periods, future/invalid records, manager permissions and rejection of invalid ranges before database queries. Browser checks cover operation with an unavailable forecasting runtime, mobile and desktop layouts, search/pagination, Tagalog and labelled offline copies. Existing XGBoost training and labelled-demo browser checks remain in place.
