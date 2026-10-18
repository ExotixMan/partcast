# PartCast design references

The layout uses familiar store tasks, solid colors, readable text and large controls. The interaction patterns below are adapted to PartCast; product screens and branding are original. References are provided for review, without claiming that Google or the other publishers endorse this application.

| Reference | Principle | Applied in PartCast |
| --- | --- | --- |
| [Google Material Design: Search](https://m3.material.io/components/search/overview) | A clear search field, visible action and understandable results | Restock searches part numbers, names and supplier names. Supplier contacts have their own search. Results show the matching count, and Clear filters restores the full list. |
| [Google Material Design: Text fields](https://m3.material.io/components/text-fields/guidelines) | Persistent labels, helpful constraints and visible error states | Forms retain labels, identify the invalid field and preserve entered values after failures. Required fields and permitted ranges remain visible. |
| [Nielsen Norman Group: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | Recognition rather than recall; minimalist design; error prevention and recovery | Short navigation names, consistent buttons, explicit empty/error states, retry actions and a clear distinction between no matching records and no saved records. |
| [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Show the main task first and reveal supporting detail when requested | Restock, Inventory, Reports, Backups, staff access, account information and forecasting explanations use optional help sections. Import replacement warnings, payment errors, source labels and forecast accuracy remain visible when relevant. |
| [Fitts’s Law](https://lawsofux.com/fittss-law/) | Larger, nearby targets are easier to select | Main controls remain at least 44 pixels high, usually 48 pixels. Phone navigation keeps icons with labels. Search, filters and their clear action stay together. |
| [Hick’s Law](https://lawsofux.com/hicks-law/) | Reduce the decisions competing for attention | Restock has two task tabs, one search and two filters. Repeated instructions and decorative summary cards have been reduced. This changes presentation rather than removing store features. |
| [WCAG 2.2: Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) and [Error Suggestion](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html) | Identify the field and explain how to correct it | Form feedback names the field, supplies a specific correction, focuses the first invalid control and links errors to controls for assistive technology. Color is accompanied by text. |
| [WCAG 2.2: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Provide sufficiently large targets and spacing | Buttons and fields retain large tap areas even where explanations and card padding are reduced. Text-size and theme preferences remain available. |

## Implementation

- [Restock](../apps/web/src/pages/ReorderPage.jsx): search by part or supplier, stock/supplier filters, meaningful no-match states and retryable loading failures. The API reads all result pages so search also covers parts after the first 1,000.
- [Form feedback](../apps/web/src/components/Form.jsx): consistent client validation for ordinary forms. Inventory and sales retain their specific financial/stock validators. Existing server and database safeguards still apply.
- [Optional help](../apps/web/src/components/HelpDetails.jsx): a consistent disclosure control rather than several permanent explanation panels.
- [Page recovery](../apps/web/src/components/ErrorBoundary.jsx): a recoverable error screen retains navigation and does not clear the durable offline queue.

Reduced visual bulk comes from shorter copy, fewer repeated panels, flat borders and optional explanations. It does not rely on shrinking important text or removing validation. No gradient colors are used.

## Review limits

Cloud access to the linked reference websites was blocked by its network proxy. The links identify established design guidance; this work does not claim a live review or a pixel-for-pixel copy of a current Google product. Automated workflow and responsive checks are recorded in [Verification](VERIFICATION.md). These checks do not replace observing actual store staff using the application or establish full WCAG conformance.
