"""Regression: contractor payment choices cannot mix up funds or rewrite audit events."""
from pathlib import Path
import sqlite3

schema = Path('database/migrations/0028_contractor_payment_choices.sql').read_text()
con = sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys=ON')
for name in ('work_orders','clients','properties','contractors','approvals','users'):
    con.execute(f'CREATE TABLE {name}(id TEXT PRIMARY KEY)')
    con.execute(f"INSERT INTO {name}(id) VALUES ('{name}_1')")
con.executescript(schema)

def insert(id,mode,fee,order='work_orders_1'):
    con.execute('''INSERT INTO contractor_payment_plans(id,work_order_id,client_id,property_id,contractor_id,mode,gross_cents,platform_fee_cents,quote_reference,invoice_reference,approval_id,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
      (id,order,'clients_1','properties_1','contractors_1',mode,10000,fee,'quote-abc','invoice-def','approvals_1','draft','2026-10-26','2026-10-26'))

def blocked(fn):
    try: fn()
    except sqlite3.IntegrityError: return
    raise AssertionError('Expected schema to reject invalid financial action')

insert('plan_direct','payer_direct',0)
assert con.execute('SELECT COUNT(*) FROM contractor_payment_events').fetchone()[0] == 1
con.execute("UPDATE contractor_payment_plans SET status='external_due' WHERE id='plan_direct'")
assert con.execute('SELECT COUNT(*) FROM contractor_payment_events').fetchone()[0] == 2
blocked(lambda: con.execute("UPDATE contractor_payment_events SET to_status='paid'"))
blocked(lambda: con.execute("DELETE FROM contractor_payment_events"))
blocked(lambda: con.execute("UPDATE contractor_payment_plans SET status='funded' WHERE id='plan_direct'"))
blocked(lambda: insert('plan_duplicate','payer_direct',0))
blocked(lambda: insert('plan_bad_fee','payer_direct',50,'other_order'))
con.execute('INSERT INTO contractor_connect_webhook_receipts(event_id,source,event_type,created_at) VALUES (?,?,?,?)',('evt_test','platform','transfer.created','2026-10-26'))
blocked(lambda: con.execute('INSERT INTO contractor_connect_webhook_receipts(event_id,source,event_type,created_at) VALUES (?,?,?,?)',('evt_test','platform','transfer.created','2026-10-26')))
blocked(lambda: con.execute("DELETE FROM contractor_connect_webhook_receipts"))
print('PASS contractor payment choice schema, segregation, uniqueness and immutable audit')