"""Capture synthetic data operations and expected results from the existing SQLite tests."""
import importlib.util
import io
import json
from pathlib import Path
import re
import sqlite3
import unittest

SCENARIOS = []
current = None
class RecordingConnection(sqlite3.Connection):
    ready = False
    def executescript(self, sql):
        result = super().executescript(sql)
        if 'CREATE TRIGGER invoice_credit_immutable' in sql:
            self.ready = True
        elif self.ready and current is not None:
            raise ValueError('Unrecorded fixture script')
        return result
    def backup(self, other, **kwargs):
        result = super().backup(other, **kwargs)
        other.ready = self.ready
        return result
    def execute(self, sql, args=()):
        op = sql.strip().split(None, 1)[0].upper()
        capture = self.ready and current is not None and op in ('SELECT','UPDATE','DELETE','INSERT','WITH')
        if re.search(r'\b(sqlite_master|sqlite_schema|pragma_\w+)\b',sql,re.I):
            capture = False  # verified independently against PostgreSQL catalogs
        record = dict(sql=sql,args=list(args))
        try:
            cursor = super().execute(sql,args)
        except sqlite3.IntegrityError as error:
            if capture:
                record['error'] = str(error)
                current.append(record)
            raise
        if capture:
            if op in ('SELECT','WITH'):
                record['rows'] = [list(row) for row in super().execute(sql,args)]
            current.append(record)
        return cursor

connect = sqlite3.connect
sqlite3.connect = lambda *args,**kwargs:connect(*args,factory=RecordingConnection,**kwargs)
class CaptureResult(unittest.TextTestResult):
    def startTest(self,test):
        global current
        current = []
        SCENARIOS.append(dict(name=test.id(),operations=current))
        super().startTest(test)
    def stopTest(self,test):
        global current
        current = None
        super().stopTest(test)

CASES = {
    'schema': 'SchemaTests', 'pcr-discount-schema':'Discounts',
    'commercial-schema':'CommercialSchema','finance-delivery-schema':'InvoiceDeliverySchemaTest',
    'reporting-schema':'ReportingSchema','rent-routing-schema':'RentPlanningSchema',
    'final-sprint-schema':'FinalSprintSchema'
}
suite = unittest.TestSuite()
for file, cls in CASES.items():
    spec = importlib.util.spec_from_file_location(file,Path('tests')/(file+'.test.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for test in unittest.defaultTestLoader.loadTestsFromTestCase(getattr(module,cls)):
        # Legacy upgrade tests start with an earlier D1 version; this port is a fresh baseline.
        if not any(word in test._testMethodName for word in ('migration','preserv','upgrade','byte','deployed','survive')):
            suite.addTest(test)
result=unittest.TextTestRunner(stream=io.StringIO(),resultclass=CaptureResult).run(suite)
if not result.wasSuccessful():
    raise RuntimeError([(str(t),err[-500:]) for t,err in result.failures+result.errors])
print(json.dumps([item for item in SCENARIOS if item['operations']]))
