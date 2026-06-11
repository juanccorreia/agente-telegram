async function appendAppointmentToSheet(db, appointment) {
  const credentialsRow = db.prepare("SELECT value FROM config WHERE key = 'google_credentials_json'").get();
  const sheetIdRow = db.prepare("SELECT value FROM config WHERE key = 'google_sheet_id'").get();

  if (!credentialsRow || !sheetIdRow) return; // not configured, skip silently

  const credentials = JSON.parse(credentialsRow.value);
  const spreadsheetId = sheetIdRow.value;

  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Agendamentos!A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[appointment.name, appointment.datetime, appointment.telegram_id, appointment.created_at]],
    },
  });
}

module.exports = { appendAppointmentToSheet };
