#!/usr/bin/env python3
"""Produce auditable derivatives; never fabricate quantities or silently repair dates."""
import argparse
from collections import Counter, defaultdict
import csv
from datetime import date, datetime
import json
from pathlib import Path
import re
import statistics


def text(value):
    return str(value).strip() if value is not None else ''


def part_key(value):
    # Preserve O/0, punctuation, brand suffixes and slash variants.
    return re.sub(r'\s+', ' ', text(value)).upper()


def numeric(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(str(value).replace(',', '').strip())
        return result if result == result and abs(result) != float('inf') else None
    except (ValueError, TypeError):
        return None


def parse_date(value, as_of):
    raw = text(value)
    if not raw:
        return None, 'missing_date'
    try:
        if re.match(r'^\d{4}-\d{2}-\d{2}', raw):
            parsed = date.fromisoformat(raw[:10])
            status = ''
        else:
            match = re.fullmatch(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', raw)
            if not match:
                return None, 'invalid_date'
            first, second, year = map(int, match.groups())
            if first > 12 and second <= 12:
                parsed = date(year, second, first)
            else:
                parsed = date(year, first, second)
            status = 'ambiguous_text_date' if first <= 12 and second <= 12 and first != second else ''
        if parsed > as_of:
            return parsed.isoformat(), 'future_date'
        return parsed.isoformat(), status
    except ValueError:
        return None, 'invalid_date'


def invoice_ref(value):
    match = re.fullmatch(r'(?:SI\s*#\s*)?0*(\d+)', text(value), re.I)
    return f'SI#{int(match[1])}' if match else None


def header_index(rows, required):
    for index, row in enumerate(rows[:30]):
        keys = {text(value).lower() for value in row}
        if required.issubset(keys):
            return index
    return None


def rows_table(records, fields):
    return [fields] + [[r.get(field) for field in fields] for r in records]


def write_csv(path, records, fields):
    with path.open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        # XLSX stores text safely; CSV readers may otherwise interpret text as formulas.
        writer.writerows({key: ("'" + value if isinstance(value, str) and value.lstrip().startswith(('=', '+', '-', '@')) else value)
                          for key, value in row.items()} for row in records)


def prepare(payload):
    as_of = date.fromisoformat(payload['as_of'])
    issues, invoices, stock, purchases, demand, candidates = [], [], [], [], [], []
    lookup = defaultdict(list)
    counts = Counter()
    seen_issues = set()

    def issue(workbook, sheet, row, code, detail):
        key = (workbook, sheet, row, code)
        if key in seen_issues:
            return
        seen_issues.add(key)
        issues.append({'Workbook': workbook, 'Sheet': sheet, 'Source Row': row, 'Issue': code, 'Detail': detail})

    for sheet in payload['sales']['sheets']:
        header = header_index(sheet['rows'], {'ref #', 'date', 'amount'})
        if header is None:
            continue
        for row_number, row in enumerate(sheet['rows'][header + 1:], header + 2):
            if not any(text(x) for x in row):
                continue
            row = row + [None] * max(0, 10 - len(row))
            ref = invoice_ref(row[0]) if sheet['name'].upper().startswith('SI') else None
            if not ref:
                issue('sales', sheet['name'], row_number, 'non_invoice_row', 'Header, note or unsupported reference; excluded from demand.')
                continue
            occurred, status = parse_date(row[1], as_of)
            amount = numeric(row[3])
            item = {'Reference': ref, 'Date': occurred, 'Original Date': text(row[1]), 'Amount': amount,
                    'Items': text(row[4]), 'Date Status': status or 'valid', 'Source Sheet': sheet['name'], 'Source Row': row_number}
            if status:
                issue('sales', sheet['name'], row_number, status, 'Original retained. Date is not silently swapped or filled.')
            if amount is not None and amount <= 0:
                issue('sales', sheet['name'], row_number, 'non_positive_amount', 'Canceled, returned or otherwise non-positive invoice; review before using as sales demand.')
            if any(text(x) for x in row[5:]):
                issue('sales', sheet['name'], row_number, 'annotation_columns', 'Unlabeled columns contain notes or totals. Not interpreted as sold quantities.')
            invoices.append(item)
            lookup[ref].append(item)
    for ref, matches in lookup.items():
        if len(matches) > 1:
            for match in matches:
                issue('sales', match['Source Sheet'], match['Source Row'], 'duplicate_invoice_reference', ref)

    # Propose, but do not apply, plausible day/month swaps suggested by adjacent invoices.
    for index, invoice in enumerate(invoices):
        if not invoice['Date'] or invoice['Date Status'] != 'valid':
            continue
        original = date.fromisoformat(invoice['Date'])
        if original.day > 12 or original.day == original.month:
            continue
        neighbors = [date.fromisoformat(other['Date']).toordinal() for j, other in enumerate(invoices[max(0, index - 4):index + 5], max(0, index - 4))
                     if j != index and other['Date'] and other['Date Status'] == 'valid']
        if len(neighbors) < 4:
            continue
        center = statistics.median(neighbors)
        alternative = date(original.year, original.day, original.month)
        if abs(original.toordinal() - center) > 60 and abs(alternative.toordinal() - center) <= 21:
            invoice['Date Status'] = 'possible_day_month_swap'
            issue('sales', invoice['Source Sheet'], invoice['Source Row'], 'possible_day_month_swap', f"Original {original}; candidate {alternative}. Needs confirmation; not changed.")

    catalog = defaultdict(list)
    for sheet in payload['inventory']['sheets']:
        header = header_index(sheet['rows'], {'quantity', 'brand'})
        if header is None:
            continue
        is_snapshot = sheet['name'].lower() == 'inventory'
        for row_number, row in enumerate(sheet['rows'][header + 1:], header + 2):
            row = row + [None] * max(0, 12 - len(row))
            qty = numeric(row[4])
            if qty is None:
                # Cached formula-only blanks and supplier title rows are not transactions.
                if any(text(row[col]) for col in (1, 2, 3, 4, 5, 8)) and text(row[4]):
                    issue('inventory', sheet['name'], row_number, 'invalid_quantity', 'Quantity must be numeric; no default quantity supplied.')
                elif is_snapshot and text(row[2]) and (text(row[0]) or text(row[1])):
                    issue('inventory', sheet['name'], row_number, 'missing_stock_quantity', 'Stock quantity is unknown. Row excluded from usable inventory; no zero quantity invented.')
                continue
            primary = part_key(row[0])
            sub = part_key(row[1])
            desc = text(row[2])
            record = {'Part Number': primary or None, 'Original Part Number': text(row[0]), 'Sub#': sub or None,
                      'Description': desc, 'Brand': text(row[3]), 'Quantity': qty, 'Source Sheet': sheet['name'], 'Source Row': row_number}
            if not primary:
                issue('inventory', sheet['name'], row_number, 'missing_part_number', 'No automatic forward-fill: adjacent rows can be different products.')
            if qty < 0:
                issue('inventory', sheet['name'], row_number, 'negative_quantity', 'Retained for review; excluded from sold demand.')
            if is_snapshot:
                record.update({'Unit': text(row[5]), 'Location': text(row[6]), 'U. cost': numeric(row[7]), 'Price': numeric(row[8]), 'Amount': numeric(row[9])})
                stock.append(record)
                if primary:
                    catalog[primary].append(record)
                continue
            occurred, status = parse_date(row[8], as_of)
            notes = ' '.join(text(v) for v in row[10:] if text(v))
            sale_refs = re.findall(r'\bSI\s*#\s*0*(\d+)', notes, re.I)
            refs = [f'SI#{int(ref)}' for ref in sale_refs]
            # Notes also contain "2STOCK" and "STOCKS"; ordinary word
            # boundaries miss those and can turn a purchase total into a sale.
            stock_note = bool(re.search(r'(?<![A-Z])STOCKS?(?![A-Z])', notes, re.I))
            record.update({'Unit cost': numeric(row[5]), 'Amount': numeric(row[6]), 'Purchase Reference': text(row[7]),
                           'Purchase Date': occurred, 'Original Purchase Date': text(row[8]), 'Purchase Date Status': status or 'valid',
                           'Supplier': text(row[9]), 'Notes': notes, 'Sales Reference': ' / '.join(refs),
                           'Classification': 'stock_purchase' if stock_note and not refs else 'sales_linked_quantity' if refs and not stock_note else 'needs_review'})
            purchases.append(record)
            if status:
                issue('inventory', sheet['name'], row_number, status, 'Purchase date preserved; sale date must come from linked invoice.')
            if not refs:
                continue
            counts['sales_linked_rows'] += 1
            reason = None
            matches = lookup.get(refs[0], []) if len(refs) == 1 else []
            if len(refs) != 1:
                reason = 'multiple_sales_references'
            elif stock_note:
                reason = 'conflicting_stock_and_sale_notes'
            elif len(matches) != 1:
                reason = 'missing_or_duplicate_invoice'
            elif not primary:
                reason = 'missing_part_number'
            elif primary in {'RADIATOR', 'COMPRESSOR', 'CONDENSER', 'EVAPORATOR ASSY', 'FAN MOTOR', 'COOLANT', 'BRAKE PAD'}:
                reason = 'generic_product_label'
            elif qty <= 0:
                reason = 'non_positive_quantity'
            elif matches[0]['Date Status'] != 'valid':
                reason = matches[0]['Date Status']
            elif matches[0]['Amount'] is None or matches[0]['Amount'] <= 0:
                reason = 'non_positive_or_missing_invoice_amount'
            elif not payload.get('linked_quantity_is_sold'):
                reason = 'quantity_meaning_not_confirmed'
            candidate = {'Date': matches[0]['Date'] if len(matches) == 1 else None, 'Part Number': primary or None,
                         'Demand Quantity': qty, 'Description': desc, 'Brand': record['Brand'], 'Sales Reference': refs[0] if len(refs) == 1 else ' / '.join(refs),
                         'Source': 'confirmed_sales_linked_quantity', 'Inventory Sheet': sheet['name'], 'Inventory Row': row_number,
                         'Sales Sheet': matches[0]['Source Sheet'] if len(matches) == 1 else None,
                         'Sales Row': matches[0]['Source Row'] if len(matches) == 1 else None, 'Status': reason or 'accepted'}
            if reason:
                issue('inventory', sheet['name'], row_number, reason, 'Linked quantity excluded from training; retained in review sheet.')
            candidates.append(candidate)
            if not reason:
                demand.append(candidate)

    # Two identical invoice/part/brand/quantity rows may be copy-paste duplication or real split lines.
    # Keep both in the review file, use neither until somebody resolves the ambiguity.
    duplicate_groups = defaultdict(list)
    for item in demand:
        duplicate_groups[(item['Sales Reference'], item['Part Number'], item['Brand'], item['Demand Quantity'])].append(item)
    for group in duplicate_groups.values():
        if len(group) > 1:
            for item in group:
                item['Status'] = 'possible_duplicate_sale_line'
                issue('inventory', item['Inventory Sheet'], item['Inventory Row'], item['Status'], 'Identical invoice, part, brand and quantity. Neither copy used without review.')
    demand = [item for item in demand if item['Status'] == 'accepted']
    for part, entries in catalog.items():
        if len(entries) > 1:
            issue('inventory', 'Inventory', entries[0]['Source Row'], 'multiple_stock_rows_same_part', f'{part}: {len(entries)} rows. Brands, units and locations retained; stock not silently summed.')

    # Explicit piece quantities are independent evidence, never inferred from total invoice value.
    # Accept only a single exact inventory part token and a single declared piece quantity.
    token_catalog = {part: re.compile(r'(?<![A-Z0-9])' + re.escape(part) + r'(?![A-Z0-9])') for part in catalog if len(part) >= 4 and re.search(r'\d', part)}
    linked_keys = {(item['Sales Reference'], item['Part Number']) for item in candidates if item['Part Number']}
    for invoice in invoices:
        item_text = part_key(invoice['Items'])
        quantities = re.findall(r'(?<![\d.])([1-9]\d*)\s*(?:PCS?|PIECES?)\b', item_text)
        if not quantities:
            continue
        counts['invoices_with_explicit_piece_quantity'] += 1
        parts = [part for part, pattern in token_catalog.items() if pattern.search(item_text)]
        if len(parts) != 1 or len(quantities) != 1 or re.search(r'\bSET\b|\bBOX\b|\bPACK\b', item_text):
            issue('sales', invoice['Source Sheet'], invoice['Source Row'], 'unresolved_explicit_quantity', 'Quantity exists in description; exact part allocation or base unit needs review.')
            continue
        part = parts[0]
        if (invoice['Reference'], part) in linked_keys:
            linked = [item for item in candidates if item['Sales Reference'] == invoice['Reference'] and item['Part Number'] == part]
            if sum(item['Demand Quantity'] for item in linked) != int(quantities[0]):
                for item in linked:
                    item['Status'] = 'conflicting_explicit_quantity'
                    issue('inventory', item['Inventory Sheet'], item['Inventory Row'], item['Status'], 'Invoice piece quantity differs from linked inventory quantity; excluded pending review.')
            continue
        if invoice['Date Status'] != 'valid' or invoice['Amount'] is None or invoice['Amount'] <= 0:
            continue
        item = {'Date': invoice['Date'], 'Part Number': part, 'Demand Quantity': int(quantities[0]), 'Description': catalog[part][0]['Description'],
                'Brand': None, 'Sales Reference': invoice['Reference'], 'Source': 'explicit_invoice_piece_quantity', 'Inventory Sheet': None,
                'Inventory Row': None, 'Sales Sheet': invoice['Source Sheet'], 'Sales Row': invoice['Source Row'], 'Status': 'accepted'}
        demand.append(item)
        candidates.append(item)
    demand = [item for item in demand if item['Status'] == 'accepted']

    aggregate = defaultdict(float)
    for item in demand:
        aggregate[(item['Date'], item['Part Number'])] += item['Demand Quantity']
    daily = [{'Date': day, 'Part Number': part, 'Demand Quantity': qty, 'Tier': 'actual_quantity',
              'Coverage': 'partial_invoice_linkage'} for (day, part), qty in sorted(aggregate.items())]
    eligible = []
    by_part = defaultdict(list)
    for item in daily:
        by_part[item['Part Number']].append(item)
    for part, rows in sorted(by_part.items()):
        first, last = rows[0]['Date'], rows[-1]['Date']
        span = (date.fromisoformat(last) - date.fromisoformat(first)).days + 1
        recent_days = sum((as_of - date.fromisoformat(x['Date'])).days <= 365 for x in rows)
        eligible.append({'Part Number': part, 'Observed Days': len(rows), 'Observed Days Last 365 Days': recent_days, 'Recorded Units': sum(x['Demand Quantity'] for x in rows),
                         'First Sale': first, 'Last Sale': last, 'Span Days': span,
                         'Meets Existing Model Minimum': len(rows) >= 5 and span >= 35,
                         'Meets Recent History Minimum': recent_days >= 5,
                         'In Current Inventory': part in catalog, 'Coverage': 'partial; missing days are not verified zero demand'})
    covered_refs = {item['Sales Reference'] for item in demand}
    monthly = defaultdict(lambda: {'Invoices': 0, 'Invoices With Accepted Quantities': 0})
    for invoice in invoices:
        if invoice['Date'] and invoice['Date Status'] == 'valid' and invoice['Amount'] is not None and invoice['Amount'] > 0:
            month = invoice['Date'][:7]
            monthly[month]['Invoices'] += 1
            monthly[month]['Invoices With Accepted Quantities'] += invoice['Reference'] in covered_refs
    coverage = [{'Month': month, **vals, 'Invoice Coverage Percent': round(100 * vals['Invoices With Accepted Quantities'] / vals['Invoices'], 2),
                 'Meaning': 'An invoice can still have other unlinked items.'} for month, vals in sorted(monthly.items())]
    summary = {'as_of': payload['as_of'], 'originals_modified': False, 'linked_quantity_is_sold': payload.get('linked_quantity_is_sold', False),
               'source_files': {key: {k: payload[key][k] for k in ('filename', 'sha256')} for key in ('sales', 'inventory')},
               'invoice_rows': len(invoices), 'unique_invoice_references': len(lookup), 'inventory_snapshot_rows': len(stock),
               'purchase_or_sales_linked_rows': len(purchases), **dict(counts), 'accepted_quantity_lines': len(demand),
               'accepted_daily_part_rows': len(daily), 'products_with_actual_quantities': len(by_part),
               'products_meeting_existing_minimum': sum(item['Meets Existing Model Minimum'] for item in eligible),
               'products_meeting_minimum_in_inventory': sum(item['Meets Existing Model Minimum'] and item['In Current Inventory'] for item in eligible),
               'products_with_five_recent_sale_days': sum(item['Meets Recent History Minimum'] for item in eligible),
               'invoices_with_accepted_quantities': len(covered_refs), 'latest_accepted_sale': max((item['Date'] for item in daily), default=None),
               'invoice_date_status': dict(Counter(item['Date Status'] for item in invoices)),
               'review_issue_counts': dict(Counter(item['Issue'] for item in issues)),
               'coverage_warning': 'Quantities are actual for accepted lines, but this is a partial sales extract. Missing part/date rows are unknown, not proven zero sales.'}
    return summary, invoices, stock, purchases, candidates, daily, eligible, coverage, issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text())
    out = Path(args.out)
    summary, invoices, stock, purchases, candidates, daily, eligible, coverage, issues = prepare(payload)
    issue_fields = ['Workbook', 'Sheet', 'Source Row', 'Issue', 'Detail']
    provenance_fields = ['Date', 'Part Number', 'Demand Quantity', 'Description', 'Brand', 'Sales Reference', 'Source', 'Inventory Sheet', 'Inventory Row', 'Sales Sheet', 'Sales Row', 'Status']
    daily_fields = ['Date', 'Part Number', 'Demand Quantity', 'Tier', 'Coverage']
    readme = [['Topic', 'Details'], ['Purpose', 'Actual quantities linked to sale invoices. Original workbooks are unchanged.'],
              ['Quantity meaning', 'User confirmed inventory Quantity on SI# notes is quantity sold; STOCK rows are purchases.'],
              ['Dates', 'Sale date comes from invoice, not purchase date. Ambiguous, future and suspicious day/month dates require review.'],
              ['Coverage', summary['coverage_warning']],
              ['Inventory prerequisite', 'Training import matches current inventory part numbers. Historical-only parts need a reviewed product catalog.'],
              ['Import', 'Daily_B_Usable is compatible with the existing training importer. Import only after reviewing coverage and freshness warnings.'],
              ['Units', 'Linked quantity uses the workbook base unit; explicit description quantities use pieces. Pack/set conversions are not invented.'],
              ['Privacy', 'Customer names are unnecessary for forecasts and omitted. Supplier notes remain in cleaned inventory for local review.'],
              ['As of', summary['as_of']]]
    tables = {
        'PartCast_Actual_Quantity_Training.xlsx': {
            'README': readme, 'Daily_B_Usable': rows_table(daily, daily_fields), 'Quantity_Provenance': rows_table(candidates, provenance_fields),
            'Product_Eligibility': rows_table(eligible, list(eligible[0]) if eligible else ['Part Number']),
            'Monthly_Coverage': rows_table(coverage, list(coverage[0]) if coverage else ['Month']), 'Review_Issues': rows_table(issues, issue_fields)},
        'Inventory_Cleaned.xlsx': {
            'Inventory': rows_table(stock, ['Part Number', 'Sub#', 'Description', 'Brand', 'Quantity', 'Unit', 'Location', 'U. cost', 'Price', 'Amount', 'Original Part Number', 'Source Sheet', 'Source Row']),
            'PurchaseHistory': rows_table(purchases, ['Part Number', 'Sub#', 'Description', 'Brand', 'Quantity', 'Unit cost', 'Amount', 'Purchase Reference', 'Purchase Date', 'Supplier', 'Notes', 'Classification', 'Sales Reference', 'Purchase Date Status', 'Source Sheet', 'Source Row']),
            'DataQuality': rows_table([item for item in issues if item['Workbook'] == 'inventory'], issue_fields)},
        'Sales_Cleaned.xlsx': {'InvoiceLedger': rows_table(invoices, ['Reference', 'Date', 'Original Date', 'Amount', 'Items', 'Date Status', 'Source Sheet', 'Source Row']),
                              'Accepted_Quantity_Lines': rows_table([item for item in candidates if item['Status'] == 'accepted'], provenance_fields),
                              'DataQuality': rows_table([item for item in issues if item['Workbook'] == 'sales'], issue_fields)}
    }
    (out / 'tables.json').write_text(json.dumps(tables, ensure_ascii=False))
    (out / 'quality-summary.json').write_text(json.dumps(summary, indent=2))
    write_csv(out / 'actual-demand-daily.csv', daily, daily_fields)
    write_csv(out / 'quantity-provenance.csv', candidates, provenance_fields)
    write_csv(out / 'review-issues.csv', issues, issue_fields)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
