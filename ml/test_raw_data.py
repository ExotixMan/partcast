import unittest
from prepare_raw_data import prepare, parse_date
from datetime import date


class RawDataTests(unittest.TestCase):
    def fixture(self, purchase_rows, sale_rows=None):
        return {
            'as_of': '2026-10-09', 'linked_quantity_is_sold': True,
            'sales': {'filename': 'sales.xlsx', 'sha256': 'fixture', 'sheets': [
                {'name': 'SI#', 'rows': [['Ref #', 'Date', 'Customer Name', 'Amount', None]] +
                 (sale_rows or [['SI#123', '2026-01-19T00:00:00Z', 'omit', 500, 'ABC-123']])}]},
            'inventory': {'filename': 'inventory.xlsx', 'sha256': 'fixture', 'sheets': [
                {'name': 'Inventory', 'rows': [['Part Number', 'Sub#', 'Description', 'Brand', 'Quantity', 'Unit']] +
                 [['ABC-123', None, 'Part', 'G', 10, 'pcs']]},
                {'name': 'ABCDE', 'rows': [['Part Number', 'Sub#', 'Description', 'Brand', 'Quantity', 'Unit cost', 'Amount', 'Reference #', 'Date', 'Supplier', 'Notes']] + purchase_rows}]}}

    def row(self, qty=2, note='SI#123', part='ABC-123'):
        return [part, None, 'Part', 'G', qty, 100, qty * 100, 'DR#555', '2025-12-15', 'Supplier', note]

    def test_sale_date_is_invoice_date_and_stock_is_not_demand(self):
        result = prepare(self.fixture([self.row(), self.row(10, 'STOCK')]))
        self.assertEqual(result[5], [{'Date': '2026-01-19', 'Part Number': 'ABC-123', 'Demand Quantity': 2.0, 'Tier': 'actual_quantity', 'Coverage': 'partial_invoice_linkage'}])
        self.assertEqual(result[3][1]['Classification'], 'stock_purchase')
        self.assertEqual(result[4][0]['Sales Row'], 2)

    def test_missing_part_is_not_filled_from_previous_row(self):
        result = prepare(self.fixture([self.row(), self.row(part=None)]))
        self.assertEqual(len(result[5]), 1)
        self.assertIn('missing_part_number', [r['Status'] for r in result[4]])

    def test_duplicate_sale_lines_are_quarantined(self):
        result = prepare(self.fixture([self.row(), self.row()]))
        self.assertEqual(result[5], [])
        self.assertEqual(result[0]['review_issue_counts']['possible_duplicate_sale_line'], 2)

    def test_blank_primary_id_is_recovered_only_from_catalog_and_invoice_evidence(self):
        row = self.row(part=None); row[1] = 'ABC-123'
        result = prepare(self.fixture([row]))
        self.assertEqual(result[5][0]['Part Number'], 'ABC-123')
        self.assertEqual(result[5][0]['Demand Quantity'], 2)
        self.assertEqual(result[4][0]['Part Identification'], 'sub_exact_catalog_and_invoice_match')
        self.assertEqual(result[4][0]['Original Part Number'], '')
        self.assertEqual(result[4][0]['Inventory Row'], 2)
        self.assertEqual(result[4][0]['Sales Row'], 2)
        self.assertIsNone(row[0])

    def test_sub_identifier_needs_an_exact_known_part_and_corresponding_invoice(self):
        cases = [('UNIDENTIFIED-123', 'UNIDENTIFIED-123'), ('ABC-123', 'Different part'),
                 ('ABC-123', 'ABC-1234'), ('ABC-123', 'XABC-123'),
                 ('ABC-123', 'ABC-123/ALT'), ('ABC-123', 'ABC-123-4')]
        for sub, description in cases:
            row = self.row(part=None); row[1] = sub
            with self.subTest(sub=sub, description=description):
                result = prepare(self.fixture([row], [['123', '2026-01-19', 'omit', 500, description]]))
                self.assertEqual(result[5], [])

    def test_identifier_recovery_does_not_override_date_or_quantity_review(self):
        row = self.row(part=None); row[1] = 'ABC-123'
        for day, description in [('5/6/2026', 'ABC-123'), ('2026-01-19', 'ABC-123 3 PCS')]:
            with self.subTest(day=day, description=description):
                result = prepare(self.fixture([row], [['123', day, 'omit', 500, description]]))
                self.assertEqual(result[5], [])

    def test_date_ambiguity_and_future_dates_are_not_repaired(self):
        self.assertEqual(parse_date('5/6/2026', date(2026, 10, 9)), ('2026-05-06', 'ambiguous_text_date'))
        self.assertEqual(parse_date('2026-12-05', date(2026, 10, 9)), ('2026-12-05', 'future_date'))
        result = prepare(self.fixture([self.row()], [['123', '5/6/2026', 'omit', 500, 'ABC-123']]))
        self.assertEqual(result[5], [])

    def test_explicit_piece_quantity_is_not_double_counted(self):
        sales = [['123', '2026-01-19', 'omit', 500, 'ABC-123 2 PCS']]
        self.assertEqual(prepare(self.fixture([self.row()], sales))[5][0]['Demand Quantity'], 2)
        self.assertEqual(prepare(self.fixture([], sales))[5][0]['Demand Quantity'], 2)

    def test_conflicting_quantity_or_mixed_stock_needs_review(self):
        sales = [['123', '2026-01-19', 'omit', 500, 'ABC-123 3 PCS']]
        self.assertEqual(prepare(self.fixture([self.row()], sales))[5], [])
        self.assertEqual(prepare(self.fixture([self.row(note='SI#123 1 STOCK')]))[5], [])
        self.assertEqual(prepare(self.fixture([self.row(note='2STOCK 1 SALE SI#123')]))[5], [])
        self.assertEqual(prepare(self.fixture([self.row(note='STOCKS 1 SALE SI#123')]))[5], [])

    def test_confirmation_is_required_for_inventory_quantity_semantics(self):
        payload = self.fixture([self.row()])
        payload['linked_quantity_is_sold'] = False
        self.assertEqual(prepare(payload)[5], [])

    def test_explicit_customer_split_preserves_total_and_uses_invoice_date(self):
        for note in ['1 STOCK1 CUSTOMER SI#123 500', '1 CUSTOMER SI#123 500 1 STOCK',
                     '1STOCK / 1 CUSTOMER SI#123', '1 STOCK 1CUSTOMER SI#123',
                     '1 STOCK 1 CUSTOMER SI#123 500/PC', '1 STOCK 1 CUSTOMER SI#123 500/SET']:
            with self.subTest(note=note):
                row = self.row(qty=2, note=note)
                payload = self.fixture([row])
                payload['customer_allocation_is_sold'] = True
                result = prepare(payload)
                self.assertEqual(result[5][0]['Demand Quantity'], 1)
                self.assertEqual(result[5][0]['Date'], '2026-01-19')
                candidate = result[4][0]
                self.assertEqual(candidate['Original Row Quantity'], 2)
                self.assertEqual(candidate['Explicit Sold Allocation'], 1)
                self.assertEqual(candidate['Explicit Stock Allocation'], 1)
                self.assertEqual(candidate['Source'], 'confirmed_explicit_customer_allocation')
                self.assertEqual(result[3][0]['Quantity'], 2)
                self.assertEqual(row[4], 2)
                self.assertEqual(result[0]['accepted_explicit_customer_allocations'], 1)

    def test_mixed_notes_need_two_explicit_matching_counts_and_confirmed_meaning(self):
        notes = ['CUSTOMER SI#123 500 1 STOCK', '1 STOCK CUSTOMER SI#123',
                 '1 STOCK 2 CUSTOMER SI#123', '1 STOCK 1 CUSTOMER SI#123 1 STOCK',
                 '1 STOCK 1 CUSTOMER SI#123 SI#124', '1 STOCK -1 CUSTOMER SI#123',
                 '1 STOCK 1.5 CUSTOMER SI#123', '1 CUSTOMER SI#123 500.1STOCK',
                 '1 STOCK 1 123 SHOP SI#123', '1 STOCK 1 PAMALIT CUSTOMER SI#123',
                 '1 STOCK 1 CUSTOMER SI#123 WARRANTY', '1 PC STOCK 1 CUSTOMER SI#123',
                 '1 STOCK 1 SET CUSTOMER SI#123']
        for note in notes:
            with self.subTest(note=note):
                payload = self.fixture([self.row(note=note)])
                payload['customer_allocation_is_sold'] = True
                self.assertEqual(prepare(payload)[5], [])
        payload = self.fixture([self.row(note='1 STOCK 1 CUSTOMER SI#123')])
        self.assertEqual(prepare(payload)[5], [])
        payload['customer_allocation_is_sold'] = True
        payload['linked_quantity_is_sold'] = False
        self.assertEqual(prepare(payload)[5], [])

    def test_customer_allocation_keeps_identity_invoice_and_duplicate_guards(self):
        note = '1 STOCK 1 CUSTOMER SI#123'
        for part in [None, 'RADIATOR', 'COOLANT']:
            with self.subTest(part=part):
                payload = self.fixture([self.row(note=note, part=part)])
                payload['customer_allocation_is_sold'] = True
                self.assertEqual(prepare(payload)[5], [])
        # An explicitly identified historical part is retained exactly, even
        # when it has no current snapshot match. Never merge a slash variant.
        payload = self.fixture([self.row(note=note, part='ABC-123/ALT')])
        payload['customer_allocation_is_sold'] = True
        result = prepare(payload)
        self.assertEqual(result[5][0]['Part Number'], 'ABC-123/ALT')
        self.assertFalse(result[6][0]['In Current Inventory'])
        for day, amount, description in [('5/6/2026', 500, 'ABC-123'),
                                         ('2026-01-19', 0, 'ABC-123'),
                                         ('2026-01-19', 500, 'ABC-123 2 PCS')]:
            with self.subTest(day=day, amount=amount, description=description):
                payload = self.fixture([self.row(note=note)], [['123', day, 'omit', amount, description]])
                payload['customer_allocation_is_sold'] = True
                self.assertEqual(prepare(payload)[5], [])
        # Invoice explicitly says one sold piece, not the two-unit purchase total.
        payload = self.fixture([self.row(note=note)], [['123', '2026-01-19', 'omit', 500, 'ABC-123 1 PC']])
        payload['customer_allocation_is_sold'] = True
        self.assertEqual(prepare(payload)[5][0]['Demand Quantity'], 1)
        payload = self.fixture([self.row(qty=1), self.row(note=note)])
        payload['customer_allocation_is_sold'] = True
        result = prepare(payload)
        self.assertEqual(result[5], [])
        self.assertTrue(all(row['Status'] == 'possible_duplicate_sale_line' for row in result[4]))


if __name__ == '__main__':
    unittest.main()
