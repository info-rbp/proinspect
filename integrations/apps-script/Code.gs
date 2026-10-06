/** ProInspect operational projection receiver. D1 remains authoritative.
 * Script Properties: PROINSPECT_WEBHOOK_SECRET, PROINSPECT_SPREADSHEET_ID.
 * Deploy only after security/release approval. No email, access codes, evidence or legal forms are accepted.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    if (!e || !e.postData || e.postData.contents.length > 65536) throw new Error('payload');
    var event = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('PROINSPECT_WEBHOOK_SECRET');
    var sheetId = PropertiesService.getScriptProperties().getProperty('PROINSPECT_SPREADSHEET_ID');
    if (!secret || !sheetId || event.version !== 1) throw new Error('configuration');
    if (
      !/^evt_[a-zA-Z0-9_]+$/.test(event.eventId) ||
      !/^\d+$/.test(String(event.timestamp)) ||
      Math.abs(Date.now() / 1000 - Number(event.timestamp)) > 300
    )
      throw new Error('event');
    if (
      !/^(booking|work_order|document|document_request|building_request|approval|payment|scheme|building_notice)\.[a-z_]+$/.test(
        event.kind,
      )
    )
      throw new Error('kind');
    var allowed = [
      'reference',
      'status',
      'serviceId',
      'propertyId',
      'schemeId',
      'workOrderId',
      'bookingId',
      'documentId',
      'startsAt',
    ];
    Object.keys(event.payload).forEach(function (key) {
      if (
        allowed.indexOf(key) < 0 ||
        typeof event.payload[key] !== 'string' ||
        event.payload[key].length > 180
      )
        throw new Error('payload');
    });
    var canonical = [
      event.timestamp,
      event.eventId,
      event.kind,
      event.entityId,
      JSON.stringify(event.payload),
    ].join('.');
    var expected = Utilities.computeHmacSha256Signature(canonical, secret, Utilities.Charset.UTF_8)
      .map(function (b) {
        return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
      })
      .join('');
    var signature = String(event.signature || '');
    var mismatch = expected.length ^ signature.length;
    for (var i = 0; i < expected.length; i++)
      mismatch |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
    if (mismatch !== 0) throw new Error('signature');
    lock.waitLock(15000);
    var book = SpreadsheetApp.openById(sheetId);
    var sheet = book.getSheetByName('ProInspect Events') || book.insertSheet('ProInspect Events');
    if (sheet.getLastRow() === 0)
      sheet.appendRow(['Event ID', 'Kind', 'Entity ID', 'Payload', 'Received at']);
    var found = sheet
      .getRange('A:A')
      .createTextFinder(event.eventId)
      .matchEntireCell(true)
      .findNext();
    if (found) {
      var existing = sheet.getRange(found.getRow(), 2, 1, 3).getValues()[0];
      if (
        existing[0] !== event.kind ||
        existing[1] !== event.entityId ||
        existing[2] !== JSON.stringify(event.payload)
      )
        throw new Error('replay_mismatch');
    } else {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(event.entityId)) throw new Error('entity');
      sheet.appendRow([
        event.eventId,
        event.kind,
        event.entityId,
        JSON.stringify(event.payload),
        new Date().toISOString(),
      ]);
    }
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, eventId: event.eventId }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (_) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'REQUEST_REJECTED' }),
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
