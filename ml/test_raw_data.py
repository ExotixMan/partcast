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


if __name__ == '__main__':
    unittest.main()
