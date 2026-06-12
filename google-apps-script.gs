const SPREADSHEET_ID = "1Y__FELo8Q922P742jto9gE_y9ObCo5yUxdynYErIl_c";

const TABLES = {
  employees: [
    "id", "name", "title", "type", "startDate", "policy", "contractHours",
    "active", "department", "updatedAt"
  ],
  shift_templates: [
    "id", "name", "start", "end", "breakMinutes", "crossesMidnight",
    "role", "color", "updatedAt"
  ],
  schedule_cells: [
    "key", "month", "employeeId", "employeeName", "date", "shiftsJson", "leaveType", "note",
    "complianceActionsJson", "createdBy", "updatedBy", "updatedAt"
  ],
  leave_balances: [
    "id", "employeeId", "employeeName", "year", "sickLeaveDays", "personalLeaveDays",
    "annualLeaveDays", "startsAt", "expiresAt", "note", "updatedAt"
  ],
  leave_records: [
    "id", "employeeId", "employeeName", "leaveType", "startDate", "endDate", "hours",
    "status", "note", "updatedAt"
  ],
  app_meta: ["key", "value", "updatedAt"]
};

function doGet(event) {
  const action = event.parameter.action || "load";
  const callback = event.parameter.callback;
  ensureSchema();

  if (action === "setup") {
    return jsonResponse({ ok: true, message: "schema ready" }, callback);
  }

  if (action === "saveAll") {
    saveDatabase(JSON.parse(event.parameter.payload || "{}"));
    return jsonResponse({ ok: true, savedAt: new Date().toISOString() }, callback);
  }

  return jsonResponse({ ok: true, data: loadDatabase() }, callback);
}

function doPost(event) {
  ensureSchema();
  const payload = JSON.parse(event.postData.contents || "{}");

  if (payload.action === "saveAll") {
    saveDatabase(payload.data || {});
    return jsonResponse({ ok: true, savedAt: new Date().toISOString() });
  }

  if (payload.action === "saveCell") {
    upsertRows("schedule_cells", "key", [payload.cell]);
    return jsonResponse({ ok: true, savedAt: new Date().toISOString() });
  }

  if (payload.action === "load") {
    return jsonResponse({ ok: true, data: loadDatabase() });
  }

  return jsonResponse({ ok: false, error: "unknown action" });
}

function ensureSchema() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const existing = spreadsheet.getSheets().map((sheet) => sheet.getName());

  Object.keys(TABLES).forEach((name, index) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      if (index === 0 && spreadsheet.getSheets().length === 1 && spreadsheet.getSheets()[0].getName() === "Sheet1") {
        sheet = spreadsheet.getSheets()[0].setName(name);
      } else {
        sheet = spreadsheet.insertSheet(name);
      }
    }
    const headers = TABLES[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#2f694d").setFontColor("#ffffff");
    sheet.autoResizeColumns(1, headers.length);
  });
}

function loadDatabase() {
  const employees = readEmployees();
  return {
    employees,
    shifts: readTable("shift_templates").map((row) => ({
      id: row.id,
      name: row.name,
      start: row.start,
      end: row.end,
      breakMinutes: Number(row.breakMinutes || 0),
      crossesMidnight: row.crossesMidnight === true || row.crossesMidnight === "TRUE" || row.crossesMidnight === "true",
      role: row.role,
      color: row.color
    })),
    schedule: readTable("schedule_cells").reduce((result, row) => {
      const employeeId = row.employeeId || getEmployeeIdByName(row.employeeName, employees);
      const key = row.key || [row.month, employeeId, row.date].join(":");
      if (!employeeId || !row.date) return result;
      result[key] = {
        shifts: parseJson(row.shiftsJson, []),
        leaveType: row.leaveType || "",
        note: row.note || "",
        complianceActions: parseJson(row.complianceActionsJson, {}),
        createdBy: row.createdBy || "",
        updatedBy: row.updatedBy || ""
      };
      return result;
    }, {}),
    leaveBalances: readTable("leave_balances").map((row) => ({
      ...row,
      employeeId: row.employeeId || getEmployeeIdByName(row.employeeName, employees),
      year: Number(row.year || 0),
      sickLeaveDays: Number(row.sickLeaveDays || 0),
      personalLeaveDays: Number(row.personalLeaveDays || 0),
      annualLeaveDays: Number(row.annualLeaveDays || 0)
    })).filter((row) => row.employeeId),
    leaveRecords: readTable("leave_records").map((row) => ({
      ...row,
      employeeId: row.employeeId || getEmployeeIdByName(row.employeeName, employees),
      hours: Number(row.hours || 0)
    })).filter((row) => row.employeeId),
    appMeta: readTable("app_meta")
  };
}

function saveDatabase(data) {
  const now = new Date().toISOString();
  const employeeNameById = buildEmployeeNameById(data.employees || []);

  writeTable("employees", (data.employees || []).map((employee) => ({
    ...employee,
    updatedAt: now
  })));

  writeTable("shift_templates", (data.shifts || []).map((shift) => ({
    ...shift,
    updatedAt: now
  })));

  const scheduleRows = Object.entries(data.schedule || {}).map(([key, cell]) => {
    const parts = key.split(":");
    return {
      key,
      month: parts[0] || "",
      employeeId: parts[1] || "",
      employeeName: employeeNameById[parts[1]] || parts[1] || "",
      date: parts[2] || "",
      shiftsJson: JSON.stringify(cell.shifts || []),
      leaveType: cell.leaveType || "",
      note: cell.note || "",
      complianceActionsJson: JSON.stringify(cell.complianceActions || {}),
      createdBy: cell.createdBy || "",
      updatedBy: cell.updatedBy || "",
      updatedAt: now
    };
  });
  writeTable("schedule_cells", scheduleRows);

  writeTable("leave_balances", (data.leaveBalances || []).map((balance) => ({
    ...balance,
    employeeId: balance.employeeId || "",
    employeeName: employeeNameById[balance.employeeId] || balance.employeeId || "",
    updatedAt: now
  })));

  writeTable("leave_records", (data.leaveRecords || []).map((record) => ({
    ...record,
    employeeId: record.employeeId || "",
    employeeName: employeeNameById[record.employeeId] || record.employeeId || "",
    updatedAt: now
  })));

  upsertRows("app_meta", "key", [
    { key: "lastSavedAt", value: now, updatedAt: now },
    { key: "schemaVersion", value: "1", updatedAt: now }
  ]);
}

function readTable(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = TABLES[name];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => headers.reduce((object, header, index) => {
      object[header] = row[index];
      return object;
    }, {}));
}

function readEmployees() {
  return readTable("employees").map((row) => ({
    ...row,
    contractHours: Number(row.contractHours || 0),
    active: row.active === true || row.active === "TRUE" || row.active === "true"
  }));
}

function buildEmployeeNameById(employees) {
  return employees.reduce((result, employee) => {
    result[employee.id] = employee.name;
    return result;
  }, {});
}

function getEmployeeIdByName(employeeName, employees) {
  if (employees.some((item) => item.id === employeeName)) return employeeName;
  const employee = employees.find((item) => item.name === employeeName);
  return employee?.id || "";
}

function writeTable(name, objects) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(name);
  const headers = TABLES[name];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
  }
  if (!objects.length) return;
  sheet.getRange(2, 1, objects.length, headers.length).setValues(objects.map((object) => (
    headers.map((header) => object[header] ?? "")
  )));
}

function upsertRows(name, keyField, objects) {
  const existing = readTable(name);
  const index = new Map(existing.map((row) => [String(row[keyField]), row]));
  objects.forEach((object) => {
    if (!object || !object[keyField]) return;
    index.set(String(object[keyField]), { ...(index.get(String(object[keyField])) || {}), ...object });
  });
  writeTable(name, Array.from(index.values()));
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function jsonResponse(payload, callback) {
  const body = callback
    ? `${callback}(${JSON.stringify(payload)});`
    : JSON.stringify(payload);
  const mimeType = callback
    ? ContentService.MimeType.JAVASCRIPT
    : ContentService.MimeType.JSON;
  return ContentService
    .createTextOutput(body)
    .setMimeType(mimeType);
}
