const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbzdzdL_8l-7nbroSZVTwGvicHDFKzgD6zfVNs50_X3P5VG7LGut2LWyEVCQfyETQtQAug/exec";
const LOCAL_CACHE_KEY = "keng-schedule-cloud-cache-v2";
const state = {
  month: "2026-06",
  activeTab: "schedule",
  roleView: "employee",
  storeFilter: "all",
  currentEmployeeId: "",
  employeeByStore: {},
  selectedCell: null,
  scheduleEmployeeFilter: "all",
  mobileScheduleView: "cards",
  employees: [],
  shifts: [],
  schedule: {},
  leaveRecords: [],
  cloud: {
    status: "idle",
    message: "尚未連線",
    lastSavedAt: ""
  },
  leaveBalances: [],
  editingEmployeeId: null,
  editingShiftId: null,
  editingLeaveBalanceId: null
};

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
const summaryColumns = [
  { key: "sick", label: "病", leaveType: "病" },
  { key: "personal", label: "事", leaveType: "事" },
  { key: "annual", label: "特休", leaveType: "特休" },
  { key: "workDays", label: "出勤天" },
  { key: "scheduledHours", label: "排班h", unit: "h" },
  { key: "attendanceHours", label: "卡勤h", unit: "h" }
];
const trackedLeaveTypes = [
  { type: "病", label: "病假", quotaKey: "sickLeaveDays" },
  { type: "事", label: "事假", quotaKey: "personalLeaveDays" },
  { type: "特休", label: "特休", quotaKey: "annualLeaveDays" }
];
const complianceCodeLabels = {
  HOLIDAY_WORK: "國定假日出勤",
  REST_DAY: "休息日不足",
  CONSEC_6D: "連續出勤超過 6 日",
  DAY_8H: "單日超過 8 小時",
  DAY_10H: "單日超過 10 小時",
  DAY_12H: "單日超過 12 小時",
  REST_30M: "班中休息不足",
  SHIFT_11H: "換班間隔不足",
  CONSEC_12D: "連續出勤超過 12 日",
  WEEK_REST_MARK: "週內休假標記不足",
  TWO_WEEK_REGULAR_2D: "兩週例假不足",
  FOUR_WEEK_160H: "四週工時超過上限",
  FOUR_WEEK_OFF_8D: "四週假日不足",
  FOUR_WEEK_REGULAR_4D: "四週例假不足",
  FOUR_WEEK_REST_4D: "四週休息日不足",
  MONTH_OT_46H: "月延長工時超過上限",
  WEEK_CONTRACT: "週契約工時超出",
  WEEK_40H: "週工時超過 40 小時",
  REGULAR_DAY: "例假不足",
  LEAVE_USED_UP: "休假額度用罄",
  LEAVE_EXPIRING: "休假即將到期",
  LEAVE_EXPIRED: "休假已到期"
};
const holidayDates = new Set(["2026-06-19"]);

function init() {
  bindEvents();
  loadLocalSnapshot();
  seedSchedule();
  renderAll();
  loadCloudData();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      renderTabs();
    });
  });

  document.getElementById("monthPicker").addEventListener("change", (event) => {
    state.month = event.target.value;
    seedSchedule();
    renderAll();
  });
  document.getElementById("roleView").addEventListener("change", (event) => {
    state.roleView = event.target.value;
    enforceRoleDefaults();
    renderAll();
  });
  document.getElementById("storeFilter").addEventListener("change", (event) => {
    rememberCurrentEmployeeForStore();
    state.storeFilter = event.target.value;
    state.scheduleEmployeeFilter = "all";
    restoreEmployeeForStore();
    renderAll();
  });
  document.getElementById("currentEmployeeSelect").addEventListener("change", (event) => {
    state.currentEmployeeId = event.target.value;
    rememberCurrentEmployeeForStore();
    enforceRoleDefaults();
    renderAll();
  });

  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("scheduleEmployeeFilter").addEventListener("change", (event) => {
    state.scheduleEmployeeFilter = event.target.value;
    renderSchedule();
  });
  document.getElementById("mobileScheduleView").addEventListener("change", (event) => {
    state.mobileScheduleView = event.target.value;
    applyMobileScheduleView();
  });
  document.getElementById("employeeFilter").addEventListener("change", renderDashboard);
  document.getElementById("severityFilter").addEventListener("change", renderDashboard);
  document.getElementById("saveCellBtn").addEventListener("click", saveDialogCell);
  document.getElementById("clearCellBtn").addEventListener("click", clearDialogCell);
  document.getElementById("employeeForm").addEventListener("submit", addEmployee);
  document.getElementById("shiftForm").addEventListener("submit", addShift);
  document.getElementById("quickScheduleForm").addEventListener("submit", applyQuickSchedule);
  document.getElementById("leaveBalanceForm").addEventListener("submit", saveLeaveBalance);
  document.getElementById("cancelEmployeeEditBtn").addEventListener("click", resetEmployeeForm);
  document.getElementById("cancelShiftEditBtn").addEventListener("click", resetShiftForm);
  document.getElementById("cancelLeaveBalanceEditBtn").addEventListener("click", resetLeaveBalanceForm);
}

function seedSchedule() {
  if (!state.employees.length) return;
  if (Object.keys(state.schedule).some((key) => key.startsWith(state.month))) return;
  const days = getDaysInMonth(state.month);
  state.employees.forEach((employee) => {
    days.forEach((date) => {
      const key = cellKey(employee.id, date);
      if (!state.schedule[key]) state.schedule[key] = emptyCell();
    });
  });
}

function renderAll() {
  renderTabs();
  renderLegend();
  populateDialogOptions();
  renderSchedule();
  renderProfile();
  renderDashboard();
  renderAdmin();
  renderCloudStatus();
}

function renderTabs() {
  enforceRoleDefaults();
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.activeTab));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === state.activeTab));
  applyMobileScheduleView();
}

function enforceRoleDefaults() {
  const canSeeAdmin = canAccessAdminViews();
  document.querySelector('[data-tab="dashboard"]').hidden = false;
  document.querySelector('[data-tab="admin"]').hidden = !canSeeAdmin;
  document.getElementById("currentEmployeeField").hidden = state.roleView !== "employee";
  if (!canSeeAdmin && state.activeTab === "admin") {
    state.activeTab = "schedule";
  }
}

function canAccessAdminViews() {
  return state.roleView === "hr" || state.roleView === "admin";
}

function canSeeAllEmployees() {
  return state.roleView === "hr" || state.roleView === "admin" || state.roleView === "manager";
}

function applyMobileScheduleView() {
  const schedulePanel = document.getElementById("schedule");
  if (!schedulePanel) return;
  schedulePanel.classList.toggle("mobile-view-matrix", state.mobileScheduleView === "matrix");
  schedulePanel.classList.toggle("mobile-view-cards", state.mobileScheduleView !== "matrix");
  const selector = document.getElementById("mobileScheduleView");
  if (selector) selector.value = state.mobileScheduleView;
}

function renderLegend() {
  const legend = document.getElementById("legend");
  legend.innerHTML = state.shifts.map((shift) => (
    `<span class="legend-item"><i class="swatch" style="background:${shift.color}"></i>${escapeHtml(shift.name)} ${shift.start}-${shift.end}</span>`
  )).join("") + `<span class="legend-item">紅字：休假/警示</span>`;
}

function renderSchedule() {
  const table = document.getElementById("scheduleTable");
  const days = getDaysInMonth(state.month);
  const compliance = groupByCell(runCompliance());
  const visibleEmployees = getVisibleEmployees().filter((employee) => (
    state.scheduleEmployeeFilter === "all" || employee.id === state.scheduleEmployeeFilter
  ));
  document.getElementById("schedule-title").textContent = `月排班矩陣 · ${getCurrentStoreLabel()}`;
  const head = [
    `<tr><th class="employee-head">姓名 / 門市</th>`,
    ...days.map((date) => {
      const d = new Date(`${date}T00:00:00`);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      return `<th class="date-head ${weekend ? "weekend" : ""}">${d.getDate()}<span class="weekday">${weekdays[d.getDay()]}</span></th>`;
    }),
    ...summaryColumns.map((column) => `<th class="summary-head">${column.label}</th>`),
    `</tr>`
  ].join("");

  const body = renderScheduleRows(visibleEmployees, days, compliance)
    || `<tr><td class="employee-cell">沒有符合條件的員工</td><td colspan="${days.length + summaryColumns.length}"></td></tr>`;

  table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  table.querySelectorAll(".day-cell").forEach((cell) => {
    cell.addEventListener("click", () => handleCellClick(cell.dataset.employeeId, cell.dataset.date));
  });
  renderMobileSchedule(days, visibleEmployees, compliance);
}

function renderScheduleRows(employees, days, compliance) {
  if (state.storeFilter !== "all" || state.scheduleEmployeeFilter !== "all") {
    return employees.map((employee) => renderEmployeeScheduleRow(employee, days, compliance)).join("");
  }

  return groupEmployeesByStore(employees).map((group) => {
    const storeRow = `<tr class="store-group-row"><td colspan="${days.length + summaryColumns.length + 1}">${escapeHtml(group.store)}</td></tr>`;
    return storeRow + group.employees.map((employee) => renderEmployeeScheduleRow(employee, days, compliance)).join("");
  }).join("");
}

function renderEmployeeScheduleRow(employee, days, compliance) {
  const row = days.map((date) => renderCell(employee, date, compliance[cellKey(employee.id, date)] || []));
  const summary = renderSummaryCells(employee, days);
  const hourPlan = getEmployeeMonthHourPlan(employee, days);
  return `<tr><td class="employee-cell"><div class="employee-name">${escapeHtml(employee.name)}</div><div class="employee-store">${escapeHtml(employee.department || "未指定門市")}</div><div class="employee-meta">${escapeHtml(employee.title)} · ${employee.type} · ${employee.contractHours}h/週</div><div class="employee-hours">已排 ${hourPlan.scheduled.toFixed(1)}h / 未排 ${hourPlan.remaining.toFixed(1)}h</div></td>${row.join("")}${summary}</tr>`;
}

function groupEmployeesByStore(employees) {
  const groups = new Map();
  employees.forEach((employee) => {
    const store = employee.department || "未指定門市";
    if (!groups.has(store)) groups.set(store, []);
    groups.get(store).push(employee);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-Hant")).map(([store, groupEmployees]) => ({
    store,
    employees: groupEmployees
  }));
}

function renderSummaryCells(employee, days) {
  const counts = getEmployeeMonthSummary(employee.id, days);
  return summaryColumns.map((column) => (
    `<td class="summary-cell">${formatSummaryValue(counts[column.key], column)}</td>`
  )).join("");
}

function getEmployeeMonthSummary(employeeId, days) {
  const counts = { sick: 0, personal: 0, annual: 0, workDays: 0, scheduledHours: 0, attendanceHours: 0 };
  days.forEach((date) => {
    const cell = state.schedule[cellKey(employeeId, date)] || emptyCell();
    if (cell.leaveType === "病") counts.sick += 1;
    if (cell.leaveType === "事") counts.personal += 1;
    if (cell.leaveType === "特休") counts.annual += 1;
    if (cell.shifts.length) counts.workDays += 1;
    counts.scheduledHours += getScheduledHoursFromCell(cell);
    counts.attendanceHours += getAttendanceHoursFromCell(cell);
  });
  return counts;
}

function formatSummaryValue(value, column) {
  if (!value) return "";
  if (column.unit === "h") return `${Number(value).toFixed(1)}h`;
  return value;
}

function getAttendanceHoursFromCell(cell) {
  const note = cell?.note || "";
  const match = note.match(/原表合計\s*([0-9]+(?:\.[0-9]+)?)h/);
  return match ? Number(match[1]) : 0;
}

function getScheduledHoursFromCell(cell) {
  return (cell?.shifts || []).map(getShift).filter(Boolean).reduce((sum, shift) => sum + workHours(shift), 0);
}

function hasAttendanceMismatch(cell) {
  const attendanceHours = getAttendanceHoursFromCell(cell);
  if (!attendanceHours) return false;
  const scheduledHours = getScheduledHoursFromCell(cell);
  return Math.abs(scheduledHours - attendanceHours) > 0.1;
}

function getEmployeeMonthHourPlan(employee, days) {
  const scheduled = days.reduce((sum, date) => {
    const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
    return sum + cell.shifts.map(getShift).filter(Boolean).reduce((shiftSum, shift) => shiftSum + workHours(shift), 0);
  }, 0);
  const monthWeeks = days.length / 7;
  const target = employee.contractHours * monthWeeks;
  return {
    scheduled,
    target,
    remaining: Math.max(0, target - scheduled)
  };
}

function renderCell(employee, date, alerts) {
  const d = new Date(`${date}T00:00:00`);
  const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
  const shiftHtml = cell.shifts.map((shiftId) => {
    const shift = getShift(shiftId);
    if (!shift) return "";
    return `<span class="shift-chip" style="border-left-color:${shift.color}"><strong>${escapeHtml(shift.name)}</strong><br>${shift.start}<br>${shift.end}<br>${workHours(shift).toFixed(1)}h</span>`;
  }).join("");
  const leaveHtml = cell.leaveType ? `<div class="leave-mark">${escapeHtml(cell.leaveType)}</div>` : "";
  const noteHtml = cell.note ? `<div class="cell-note">${escapeHtml(cell.note)}</div>` : "";
  const alertStatus = getCellAlertStatus(employee.id, date, alerts);
  const alertHtml = renderCellAlertBadge(alertStatus);
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const mismatch = hasAttendanceMismatch(cell);
  const title = mismatch ? `排班 ${getScheduledHoursFromCell(cell).toFixed(1)}h / 卡勤 ${getAttendanceHoursFromCell(cell).toFixed(1)}h` : "";
  const mismatchHtml = mismatch ? `<div class="attendance-mismatch-badge">排勤差異</div>` : "";
  return `<td class="day-cell ${weekend ? "weekend" : ""} ${mismatch ? "attendance-mismatch" : ""}" data-employee-id="${employee.id}" data-date="${date}" title="${escapeHtml(title)}">${leaveHtml}${shiftHtml}${noteHtml}${mismatchHtml}${alertHtml}</td>`;
}

function renderMobileSchedule(days, visibleEmployees, compliance) {
  const list = document.getElementById("mobileScheduleList");
  const cards = [];
  days.forEach((date) => {
    visibleEmployees.forEach((employee) => {
      const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
      const alerts = compliance[cellKey(employee.id, date)] || [];
      const alertStatus = getCellAlertStatus(employee.id, date, alerts);
      const hasContent = cell.shifts.length || cell.leaveType || cell.note || alerts.length;
      if (!hasContent) return;
      const d = new Date(`${date}T00:00:00`);
      const shiftText = cell.shifts.map((shiftId) => {
        const shift = getShift(shiftId);
        return shift ? `<span>${escapeHtml(shift.name)} ${shift.start}-${shift.end} · ${workHours(shift).toFixed(1)}h</span>` : "";
      }).join("");
      const mismatch = hasAttendanceMismatch(cell);
      cards.push(`
        <button class="mobile-schedule-card ${mismatch ? "attendance-mismatch" : ""}" type="button" data-employee-id="${employee.id}" data-date="${date}">
          <div class="mobile-card-date">
            <strong>${d.getDate()}</strong>
            <span>${weekdays[d.getDay()]}</span>
          </div>
          <div class="mobile-card-main">
            <strong>${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</strong>
            <div>${shiftText || `<span class="mobile-muted">${escapeHtml(cell.leaveType || "未排班")}</span>`}</div>
            ${cell.leaveType ? `<em>${escapeHtml(cell.leaveType)}</em>` : ""}
            ${cell.note ? `<small>${escapeHtml(cell.note)}</small>` : ""}
            ${mismatch ? `<b class="attendance-mismatch-badge">排勤差異</b>` : ""}
            ${renderMobileAlertBadge(alertStatus)}
          </div>
        </button>
      `);
    });
  });
  list.innerHTML = cards.join("") || `<div class="mobile-empty">這個條件下沒有排班資料。</div>`;
  list.querySelectorAll(".mobile-schedule-card").forEach((card) => {
    card.addEventListener("click", () => handleCellClick(card.dataset.employeeId, card.dataset.date));
  });
}

function handleCellClick(employeeId, date) {
  state.selectedCell = { employeeId, date };
  openDialog(employeeId, date);
}

function openDialog(employeeId, date) {
  const employee = state.employees.find((item) => item.id === employeeId);
  const cell = state.schedule[cellKey(employeeId, date)] || emptyCell();
  const cellAlerts = runCompliance().filter((item) => item.employeeId === employeeId && item.scope === date);
  document.getElementById("dialogTitle").textContent = `${employee.name} · ${date}`;
  Array.from(document.getElementById("shiftSelect").options).forEach((option) => {
    option.selected = cell.shifts.includes(option.value);
  });
  document.getElementById("leaveType").value = cell.leaveType;
  document.getElementById("noteInput").value = cell.note;
  setCellDialogEditMode(true);
  renderCellLeaveBalance(employeeId, date);
  renderCellAlertDetails(cellAlerts);
  document.getElementById("cellDialog").showModal();
}

function setCellDialogEditMode(canEdit) {
  document.getElementById("shiftSelect").disabled = !canEdit;
  document.getElementById("leaveType").disabled = !canEdit;
  document.getElementById("noteInput").disabled = !canEdit;
  document.getElementById("saveCellBtn").hidden = !canEdit;
  document.getElementById("clearCellBtn").hidden = !canEdit;
}

function renderCellLeaveBalance(employeeId, date) {
  const balance = state.leaveBalances.find((item) => item.employeeId === employeeId && isDateInLeavePeriod(item, date));
  const box = document.getElementById("cellLeaveBalanceDetails");
  if (!balance) {
    box.innerHTML = `<div class="cell-alert-empty">此員工尚未設定此日期適用的週年制休假額度。</div>`;
    return;
  }
  box.innerHTML = `<div class="cell-alert-empty">${renderLeaveUsageLines(balance).join("<br>")}<br>期限：${escapeHtml(balance.expiresAt)}</div>`;
}

function renderCellAlertDetails(alerts) {
  const alertBox = document.getElementById("cellAlertDetails");
  if (!alerts.length) {
    alertBox.innerHTML = `<div class="cell-alert-empty">目前沒有此日期的法遵警示。</div>`;
    return;
  }
  const { employeeId, date } = state.selectedCell;
  const actions = getCellAlertActions(employeeId, date);
  alertBox.innerHTML = alerts.map((alert) => (
    renderCellAlertItem(alert, actions)
  )).join("");
}

function renderCellAlertItem(alert, actions) {
  const actionKey = getAlertActionKey(alert);
  const actionText = actions[actionKey] || "";
  const handled = actionText.trim().length > 0;
  const severityLabel = alert.severity === "block" ? "阻擋" : "警告";
  const severityClass = handled ? "severity-handled" : (alert.severity === "block" ? "severity-block" : "severity-warn");
  return `
    <article class="cell-alert-item ${severityClass}">
      <div>
        <strong>${severityLabel} · ${escapeHtml(getComplianceCodeLabel(alert.code))}${handled ? "（已處理）" : ""}</strong>
        <span>${escapeHtml(alert.message)}</span>
      </div>
      <em>${escapeHtml(alert.suggestion)}</em>
      <label class="alert-action-field">
        <span>處理方式</span>
        <textarea rows="2" data-alert-action-key="${escapeHtml(actionKey)}" placeholder="例如：已確認補休日期、已調整班表、已留存同意紀錄">${escapeHtml(actionText)}</textarea>
      </label>
    </article>
  `;
}

function saveDialogCell() {
  if (!state.selectedCell) return;
  const role = state.roleView;
  state.schedule[cellKey(state.selectedCell.employeeId, state.selectedCell.date)] = {
    ...getDialogCellValue(),
    createdBy: role,
    updatedBy: role
  };
  document.getElementById("cellDialog").close();
  afterDataChange();
}

function getDialogCellValue() {
  const selectedShifts = Array.from(document.getElementById("shiftSelect").selectedOptions).map((option) => option.value);
  const currentCell = state.schedule[cellKey(state.selectedCell.employeeId, state.selectedCell.date)] || emptyCell();
  const complianceActions = { ...(currentCell.complianceActions || {}) };
  document.querySelectorAll("[data-alert-action-key]").forEach((input) => {
    const value = input.value.trim();
    if (value) complianceActions[input.dataset.alertActionKey] = value;
    else delete complianceActions[input.dataset.alertActionKey];
  });
  return {
    shifts: selectedShifts,
    leaveType: document.getElementById("leaveType").value,
    note: document.getElementById("noteInput").value.trim(),
    complianceActions
  };
}

function clearDialogCell() {
  if (!state.selectedCell) return;
  state.schedule[cellKey(state.selectedCell.employeeId, state.selectedCell.date)] = emptyCell();
  document.getElementById("cellDialog").close();
  afterDataChange();
}

function applyQuickSchedule(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const employeeId = formData.get("employeeId");
  const date = formData.get("date");
  const dateMonth = date.slice(0, 7);
  const selectedShifts = Array.from(form.elements.shiftIds.selectedOptions).map((option) => option.value);

  if (!employeeId || !date) return;
  if (dateMonth !== state.month) {
    state.month = dateMonth;
    document.getElementById("monthPicker").value = dateMonth;
    seedSchedule();
  }

  state.schedule[cellKey(employeeId, date)] = {
    shifts: selectedShifts,
    leaveType: formData.get("leaveType"),
    note: formData.get("note").trim(),
    complianceActions: {},
    createdBy: "quick-schedule",
    updatedBy: "quick-schedule"
  };
  state.scheduleEmployeeFilter = employeeId;
  form.elements.note.value = "";
  form.elements.leaveType.value = "";
  Array.from(form.elements.shiftIds.options).forEach((option) => {
    option.selected = false;
  });
  state.activeTab = "schedule";
  afterDataChange();
}

function populateDialogOptions() {
  const shiftSelect = document.getElementById("shiftSelect");
  shiftSelect.innerHTML = state.shifts.map((shift) => (
    `<option value="${shift.id}">${escapeHtml(shift.name)} ${shift.start}-${shift.end} ${workHours(shift).toFixed(1)}h</option>`
  )).join("");

  populateStoreFilter();
  const activeEmployees = getVisibleEmployees();
  ensureStoreEmployeeSelection(activeEmployees);
  document.getElementById("roleView").value = state.roleView;
  const currentEmployeeSelect = document.getElementById("currentEmployeeSelect");
  currentEmployeeSelect.innerHTML = activeEmployees.map((employee) => (
    `<option value="${employee.id}">${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</option>`
  )).join("");
  currentEmployeeSelect.value = state.currentEmployeeId;

  const scheduleEmployeeFilter = document.getElementById("scheduleEmployeeFilter");
  const currentScheduleEmployee = state.scheduleEmployeeFilter || "all";
  scheduleEmployeeFilter.disabled = false;
  scheduleEmployeeFilter.innerHTML = `<option value="all">${escapeHtml(getScheduleEmployeeAllLabel())}</option>` + activeEmployees.map((employee) => (
    `<option value="${employee.id}">${escapeHtml(employee.name)} · ${escapeHtml(employee.department || "未指定門市")} · ${escapeHtml(employee.title)}</option>`
  )).join("");
  state.scheduleEmployeeFilter = activeEmployees.some((employee) => employee.id === currentScheduleEmployee) ? currentScheduleEmployee : "all";
  scheduleEmployeeFilter.value = state.scheduleEmployeeFilter;

  const employeeFilter = document.getElementById("employeeFilter");
  const current = employeeFilter.value || "all";
  if (canSeeAllEmployees()) {
    employeeFilter.disabled = false;
    employeeFilter.innerHTML = `<option value="all">全部</option>` + activeEmployees.map((employee) => (
      `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`
    )).join("");
    employeeFilter.value = activeEmployees.some((employee) => employee.id === current) ? current : "all";
  } else {
    employeeFilter.disabled = true;
    const employee = activeEmployees.find((item) => item.id === state.currentEmployeeId);
    employeeFilter.innerHTML = `<option value="${state.currentEmployeeId}">${escapeHtml(employee?.name || "我的資訊")}</option>`;
    employeeFilter.value = state.currentEmployeeId;
  }

  const quickScheduleForm = document.getElementById("quickScheduleForm");
  quickScheduleForm.elements.employeeId.innerHTML = activeEmployees.map((employee) => (
    `<option value="${employee.id}">${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</option>`
  )).join("");
  quickScheduleForm.elements.shiftIds.innerHTML = state.shifts.map((shift) => (
    `<option value="${shift.id}">${escapeHtml(shift.name)} ${shift.start}-${shift.end}</option>`
  )).join("");
  if (!quickScheduleForm.elements.date.value) {
    quickScheduleForm.elements.date.value = `${state.month}-01`;
  }

  const leaveBalanceForm = document.getElementById("leaveBalanceForm");
  leaveBalanceForm.elements.employeeId.innerHTML = activeEmployees.map((employee) => (
    `<option value="${employee.id}">${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</option>`
  )).join("");
}

function populateStoreFilter() {
  const storeFilter = document.getElementById("storeFilter");
  const stores = [...new Set(state.employees.map((employee) => employee.department).filter(Boolean))].sort();
  const current = stores.includes(state.storeFilter) ? state.storeFilter : "all";
  storeFilter.innerHTML = `<option value="all">全部門市</option>` + stores.map((store) => (
    `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`
  )).join("");
  state.storeFilter = current;
  storeFilter.value = current;
}

function getVisibleEmployees() {
  return state.employees.filter((employee) => (
    employee.active && (state.storeFilter === "all" || employee.department === state.storeFilter)
  ));
}

function getCurrentStoreLabel() {
  return state.storeFilter === "all" ? "全部門市" : state.storeFilter;
}

function getScheduleEmployeeAllLabel() {
  return state.storeFilter === "all" ? "全部門市員工" : `${state.storeFilter}全部員工`;
}

function getStoreSelectionKey() {
  return state.storeFilter || "all";
}

function rememberCurrentEmployeeForStore() {
  if (!state.currentEmployeeId) return;
  state.employeeByStore[getStoreSelectionKey()] = state.currentEmployeeId;
}

function restoreEmployeeForStore() {
  state.currentEmployeeId = state.employeeByStore[getStoreSelectionKey()] || "";
}

function ensureStoreEmployeeSelection(activeEmployees) {
  if (!activeEmployees.length) {
    state.currentEmployeeId = "";
    return;
  }
  if (activeEmployees.some((employee) => employee.id === state.currentEmployeeId)) {
    rememberCurrentEmployeeForStore();
    return;
  }
  const remembered = state.employeeByStore[getStoreSelectionKey()];
  state.currentEmployeeId = activeEmployees.some((employee) => employee.id === remembered)
    ? remembered
    : activeEmployees[0].id;
  rememberCurrentEmployeeForStore();
}

function renderDashboard() {
  populateDialogOptions();
  const compliance = runCompliance();
  const days = getDaysInMonth(state.month);
  const selectedEmployee = canSeeAllEmployees() ? (document.getElementById("employeeFilter").value || "all") : state.currentEmployeeId;
  const selectedSeverity = document.getElementById("severityFilter").value || "all";
  const visibleEmployeeIds = new Set(getVisibleEmployees().map((employee) => employee.id));
  const visibleCompliance = compliance.filter((item) => (
    visibleEmployeeIds.has(item.employeeId) &&
    (selectedEmployee === "all" || item.employeeId === selectedEmployee) &&
    (selectedSeverity === "all" || item.severity === selectedSeverity)
  ));
  const leaveWarnings = getLeaveBalanceWarnings().filter((item) => (
    visibleEmployeeIds.has(item.employeeId) &&
    (selectedEmployee === "all" || item.employeeId === selectedEmployee) &&
    (selectedSeverity === "all" || item.severity === selectedSeverity)
  ));
  const totals = getEmployeeTotals();
  const dashboardEmployees = getVisibleEmployees().filter((employee) => (
    employee.active && (selectedEmployee === "all" || employee.id === selectedEmployee)
  ));
  const monthHours = dashboardEmployees.reduce((sum, employee) => sum + (totals[employee.id]?.hours || 0), 0);
  const overtimeRisk = dashboardEmployees.reduce((sum, employee) => {
    const total = totals[employee.id] || { hours: 0, contractHours: employee.contractHours };
    return sum + Math.max(0, total.hours - total.contractHours * 4);
  }, 0);
  const leaveCount = dashboardEmployees.reduce((sum, employee) => (
    sum + days.filter((date) => ["特休", "請假", "病", "事"].includes((state.schedule[cellKey(employee.id, date)] || emptyCell()).leaveType)).length
  ), 0);
  const blockingWarnings = visibleCompliance.filter((item) => (
    item.severity === "block" && !getComplianceActionText(item)
  )).length;

  document.getElementById("metrics").innerHTML = [
    metric("本月總工時", `${monthHours.toFixed(1)}h`),
    metric("阻擋警示", blockingWarnings),
    metric("加班風險", `${overtimeRisk.toFixed(1)}h`),
    metric("休假/請假", `${leaveCount} 天`)
  ].join("");

  const warningItems = [
    ...visibleCompliance.map(renderComplianceItem),
    ...leaveWarnings.map(renderLeaveWarningItem)
  ];
  document.getElementById("complianceList").innerHTML = warningItems.length
    ? warningItems.join("")
    : `<div class="list-item severity-ok"><strong>目前沒有符合篩選條件的警示</strong><span>可切換月份或調整排班後重新檢視。</span></div>`;

  document.getElementById("coverageList").innerHTML = days.map(renderCoverageItem).join("");
  document.getElementById("employeeSummary").innerHTML = dashboardEmployees.map((employee) => {
    const total = totals[employee.id] || { hours: 0, workDays: 0, leaveDays: 0 };
    const severity = total.hours > employee.contractHours * 4 ? "severity-warn" : "severity-ok";
    return `<div class="list-item ${severity}"><strong>${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</strong><span>${total.hours.toFixed(1)}h / ${total.workDays} 出勤日 / ${total.leaveDays} 休假標記</span></div>`;
  }).join("");
  renderDashboardLeaveSummary(dashboardEmployees);
}

function renderDashboardLeaveSummary(employees) {
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const balances = state.leaveBalances.filter((balance) => isBalanceVisibleInMonth(balance, state.month) && employeeIds.has(balance.employeeId));
  document.getElementById("dashboardLeaveSummary").innerHTML = balances.length
    ? balances.map((balance) => {
      const employee = state.employees.find((item) => item.id === balance.employeeId);
      return `<div class="list-item ${getLeaveExpiryClass(balance.expiresAt)}"><strong>${escapeHtml(employee?.name || "未指定員工")} · ${balance.year} 年休假</strong>${renderLeaveUsageLines(balance).map((line) => `<span>${line}</span>`).join("")}<span>期間：${escapeHtml(getLeavePeriodText(balance))}</span></div>`;
    }).join("")
    : `<div class="list-item"><strong>尚未設定休假額度</strong><span>請由人資在資料維護建立週年制休假額度。</span></div>`;
}

function renderProfile() {
  const employee = state.employees.find((item) => item.id === state.currentEmployeeId) || state.employees.find((item) => item.active);
  const profile = document.getElementById("profileDetails");
  if (!profile) return;
  if (!employee) {
    profile.innerHTML = `<div class="section-block"><h3>尚未建立員工資料</h3><p>請由人資先在資料維護新增員工。</p></div>`;
    return;
  }

  const monthDays = getDaysInMonth(state.month);
  const hourPlan = getEmployeeMonthHourPlan(employee, monthDays);
  const balance = state.leaveBalances.find((item) => item.employeeId === employee.id && isBalanceVisibleInMonth(item, state.month));
  const leaveContent = balance
    ? trackedLeaveTypes.map((leave) => renderProfileLeaveCard(balance, leave)).join("")
    : `<div class="list-item"><strong>尚未設定休假額度</strong><span>目前月份沒有可用的週年制休假資料。</span></div>`;

  profile.innerHTML = `
    <article class="section-block profile-card">
      <h3>${escapeHtml(employee.name)}</h3>
      <div class="profile-facts">
        <span><strong>職稱</strong>${escapeHtml(employee.title)}</span>
        <span><strong>身分</strong>${escapeHtml(employee.type)}</span>
        <span><strong>入職日</strong>${escapeHtml(employee.startDate)}</span>
        <span><strong>工時制度</strong>${escapeHtml(employee.policy)}</span>
        <span><strong>契約工時</strong>${employee.contractHours}h/週</span>
        <span><strong>門市/部門</strong>${escapeHtml(employee.department)}</span>
      </div>
      <div class="profile-hours">
        <strong>${hourPlan.scheduled.toFixed(1)}h</strong>
        <span>本月已排，距離參考工時尚餘 ${hourPlan.remaining.toFixed(1)}h</span>
      </div>
    </article>
    <article class="section-block profile-leave-block">
      <h3>休假使用</h3>
      ${balance ? `<p>週年期間：${escapeHtml(getLeavePeriodText(balance))}</p>` : ""}
      <div class="profile-leave-grid">${leaveContent}</div>
    </article>
  `;
}

function renderProfileLeaveCard(balance, leave) {
  const usage = getLeaveUsage(balance, leave);
  const usedDates = usage.dates.length ? formatUsedDates(usage.dates) : "尚無";
  return `
    <div class="leave-usage-card">
      <strong>${escapeHtml(leave.label)}</strong>
      <span>可用 ${formatDays(usage.quota)} 天</span>
      <span>已用 ${formatDays(usage.used)} 天</span>
      <b>剩餘 ${formatDays(usage.remaining)} 天</b>
      <small>已用日期：${escapeHtml(usedDates)}</small>
    </div>
  `;
}

function metric(label, value) {
  return `<div class="metric-card"><strong>${value}</strong><span>${label}</span></div>`;
}

function renderComplianceItem(item) {
  const employee = state.employees.find((entry) => entry.id === item.employeeId);
  const actionText = getComplianceActionText(item);
  const handled = actionText.length > 0;
  const severityClass = handled ? "severity-ok" : `severity-${item.severity}`;
  return `<div class="list-item ${severityClass}"><strong>${escapeHtml(employee.name)} · ${escapeHtml(item.scope)} · ${escapeHtml(getComplianceCodeLabel(item.code))}${handled ? "（已處理）" : ""}</strong><span>${escapeHtml(item.message)}</span><span>${escapeHtml(handled ? `處理方式：${actionText}` : item.suggestion)}</span></div>`;
}

function renderLeaveWarningItem(item) {
  const employee = state.employees.find((entry) => entry.id === item.employeeId);
  return `<div class="list-item severity-${item.severity}"><strong>${escapeHtml(employee?.name || "未指定員工")} · ${escapeHtml(item.leaveLabel)} · ${escapeHtml(getComplianceCodeLabel(item.code))}</strong><span>${escapeHtml(item.message)}</span><span>${escapeHtml(item.suggestion)}</span></div>`;
}

function getLeaveBalanceWarnings() {
  return state.leaveBalances.flatMap((balance) => {
    const expiry = new Date(`${balance.expiresAt}T00:00:00`);
    const today = new Date();
    const daysLeft = Math.ceil((expiry - today) / MS_PER_DAY);
    const warnings = [];
    trackedLeaveTypes.forEach((leave) => {
      const usage = getLeaveUsage(balance, leave);
      if (usage.remaining <= 0 && usage.used > 0) {
        warnings.push({
          employeeId: balance.employeeId,
          leaveLabel: leave.label,
          severity: "warn",
          code: "LEAVE_USED_UP",
          message: `${balance.year} 年${leave.label}已無剩餘天數。`,
          suggestion: `若仍需排${leave.label}，請先確認是否有展延或人工調整額度。`
        });
      }
      if (usage.remaining > 0 && daysLeft >= 0 && daysLeft <= 30) {
        warnings.push({
          employeeId: balance.employeeId,
          leaveLabel: leave.label,
          severity: "warn",
          code: "LEAVE_EXPIRING",
          message: `剩餘 ${formatDays(usage.remaining)} 天${leave.label}將於 ${balance.expiresAt} 到期。`,
          suggestion: `提醒員工安排${leave.label}或由人資確認是否展延。`
        });
      }
      if (daysLeft < 0 && usage.remaining > 0) {
        warnings.push({
          employeeId: balance.employeeId,
          leaveLabel: leave.label,
          severity: "block",
          code: "LEAVE_EXPIRED",
          message: `${balance.year} 年${leave.label}已於 ${balance.expiresAt} 到期，仍有 ${formatDays(usage.remaining)} 天未使用。`,
          suggestion: "請由人資確認是否結清、展延或調整額度。"
        });
      }
    });
    return warnings;
  });
}

function renderCoverageItem(date) {
  const requirements = ["主任", "專員", "早計", "晚計"];
  const workingTitles = new Set(state.employees.flatMap((employee) => {
    const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
    return cell.shifts.length ? [employee.title] : [];
  }));
  const missing = requirements.filter((role) => !workingTitles.has(role));
  const severity = missing.length ? "severity-warn" : "severity-ok";
  return `<div class="list-item ${severity}"><strong>${date}</strong><span>${missing.length ? `缺少：${missing.join("、")}` : "職務覆蓋完整"}</span></div>`;
}

function renderAdmin() {
  document.getElementById("employeeList").innerHTML = state.employees.map((employee) => (
    `<div class="list-item"><strong>${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</strong><span>${employee.type} · ${employee.policy} · ${employee.contractHours}h/週 · ${escapeHtml(employee.department)}</span><span>${escapeHtml(getLeaveBalanceSummaryText(employee.id))}</span><div class="item-actions"><button class="button secondary" type="button" data-edit-employee="${employee.id}">編輯</button><button class="button danger" type="button" data-delete-employee="${employee.id}">刪除</button></div></div>`
  )).join("");
  document.getElementById("shiftList").innerHTML = state.shifts.map((shift) => (
    `<div class="list-item"><strong><i class="swatch" style="background:${shift.color}"></i> ${escapeHtml(shift.name)}</strong><span>${shift.start}-${shift.end} · 休息 ${shift.breakMinutes} 分 · ${workHours(shift).toFixed(1)}h · ${escapeHtml(shift.role)}</span><div class="item-actions"><button class="button secondary" type="button" data-edit-shift="${shift.id}">編輯</button><button class="button danger" type="button" data-delete-shift="${shift.id}">刪除</button></div></div>`
  )).join("");
  document.getElementById("leaveBalanceList").innerHTML = state.leaveBalances.length
    ? state.leaveBalances.map(renderLeaveBalanceItem).join("")
    : `<div class="list-item"><strong>尚未建立休假額度</strong><span>新增後會自動依排班格中的「病、事、特休」統計已用與剩餘天數。</span></div>`;
  document.querySelectorAll("[data-edit-employee]").forEach((button) => {
    button.addEventListener("click", () => editEmployee(button.dataset.editEmployee));
  });
  document.querySelectorAll("[data-delete-employee]").forEach((button) => {
    button.addEventListener("click", () => deleteEmployee(button.dataset.deleteEmployee));
  });
  document.querySelectorAll("[data-edit-shift]").forEach((button) => {
    button.addEventListener("click", () => editShift(button.dataset.editShift));
  });
  document.querySelectorAll("[data-delete-shift]").forEach((button) => {
    button.addEventListener("click", () => deleteShift(button.dataset.deleteShift));
  });
  document.querySelectorAll("[data-edit-leave-balance]").forEach((button) => {
    button.addEventListener("click", () => editLeaveBalance(button.dataset.editLeaveBalance));
  });
  document.querySelectorAll("[data-delete-leave-balance]").forEach((button) => {
    button.addEventListener("click", () => deleteLeaveBalance(button.dataset.deleteLeaveBalance));
  });
}

function renderLeaveBalanceItem(balance) {
  const employee = state.employees.find((item) => item.id === balance.employeeId);
  const expiryClass = getLeaveExpiryClass(balance.expiresAt);
  return `<div class="list-item ${expiryClass}"><strong>${escapeHtml(employee?.name || "未指定員工")} · ${balance.year} 年休假</strong>${renderLeaveUsageLines(balance).map((line) => `<span>${line}</span>`).join("")}<span>期間：${escapeHtml(getLeavePeriodText(balance))}${balance.note ? ` · ${escapeHtml(balance.note)}` : ""}</span><div class="item-actions"><button class="button secondary" type="button" data-edit-leave-balance="${balance.id}">編輯</button><button class="button danger" type="button" data-delete-leave-balance="${balance.id}">刪除</button></div></div>`;
}

function addEmployee(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get("id") || `e${Date.now()}`;
  const employeeData = {
    id,
    name: form.get("name").trim(),
    title: form.get("title").trim(),
    type: form.get("type"),
    startDate: form.get("startDate"),
    policy: "四週變形工時",
    contractHours: Number(form.get("contractHours")),
    active: true,
    department: form.get("department").trim()
  };
  const existingIndex = state.employees.findIndex((employee) => employee.id === id);
  if (existingIndex >= 0) {
    state.employees[existingIndex] = employeeData;
  } else {
    state.employees.push(employeeData);
    getDaysInMonth(state.month).forEach((date) => {
      state.schedule[cellKey(id, date)] = emptyCell();
    });
  }
  saveEmployeeLeaveBalanceFromForm(id, form);
  resetEmployeeForm();
  afterDataChange();
}

function addShift(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get("id") || `s${Date.now()}`;
  const shiftData = {
    id,
    name: form.get("name").trim(),
    start: form.get("start"),
    end: form.get("end"),
    breakMinutes: Number(form.get("breakMinutes")),
    crossesMidnight: form.get("end") <= form.get("start"),
    role: form.get("role").trim(),
    color: form.get("color")
  };
  const existingIndex = state.shifts.findIndex((shift) => shift.id === id);
  if (existingIndex >= 0) {
    state.shifts[existingIndex] = shiftData;
  } else {
    state.shifts.push(shiftData);
  }
  resetShiftForm();
  afterDataChange();
}

function editEmployee(id) {
  const employee = state.employees.find((item) => item.id === id);
  if (!employee) return;
  const form = document.getElementById("employeeForm");
  form.elements.id.value = employee.id;
  form.elements.name.value = employee.name;
  form.elements.title.value = employee.title;
  form.elements.type.value = employee.type;
  form.elements.contractHours.value = employee.contractHours;
  form.elements.startDate.value = employee.startDate;
  form.elements.department.value = employee.department;
  setEmployeeLeaveFields(form, getEditableEmployeeLeaveBalance(employee.id));
  state.editingEmployeeId = id;
  document.getElementById("employeeFormTitle").textContent = `修改員工：${employee.name}`;
  document.getElementById("employeeSubmitBtn").textContent = "儲存修改";
  document.getElementById("cancelEmployeeEditBtn").hidden = false;
}

function deleteEmployee(id) {
  const employee = state.employees.find((item) => item.id === id);
  if (!employee) return;
  if (!confirm(`確定刪除 ${employee.name}？此員工的本機排班資料也會移除。`)) return;
  state.employees = state.employees.filter((item) => item.id !== id);
  state.leaveBalances = state.leaveBalances.filter((item) => item.employeeId !== id);
  Object.keys(state.schedule).forEach((key) => {
    if (key.includes(`:${id}:`)) delete state.schedule[key];
  });
  if (state.scheduleEmployeeFilter === id) state.scheduleEmployeeFilter = "all";
  if (state.editingEmployeeId === id) resetEmployeeForm();
  afterDataChange();
}

function resetEmployeeForm() {
  const form = document.getElementById("employeeForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.contractHours.value = 40;
  form.elements.startDate.value = "2025-01-01";
  form.elements.department.value = "台南門市";
  setEmployeeLeaveFields(form, null);
  state.editingEmployeeId = null;
  document.getElementById("employeeFormTitle").textContent = "新增員工";
  document.getElementById("employeeSubmitBtn").textContent = "新增員工";
  document.getElementById("cancelEmployeeEditBtn").hidden = true;
}

function getEditableEmployeeLeaveBalance(employeeId) {
  return state.leaveBalances.find((item) => item.employeeId === employeeId && isBalanceVisibleInMonth(item, state.month))
    || state.leaveBalances.find((item) => item.employeeId === employeeId && item.year === Number(state.month.slice(0, 4)));
}

function setEmployeeLeaveFields(form, balance) {
  const year = state.month.slice(0, 4);
  form.elements.sickLeaveDays.value = balance?.sickLeaveDays ?? 30;
  form.elements.personalLeaveDays.value = balance?.personalLeaveDays ?? 14;
  form.elements.annualLeaveDays.value = balance?.annualLeaveDays ?? 7;
  form.elements.leaveStartsAt.value = balance ? getLeaveStartsAt(balance) : `${year}-01-01`;
  form.elements.leaveExpiresAt.value = balance?.expiresAt || `${year}-12-31`;
}

function saveEmployeeLeaveBalanceFromForm(employeeId, formData) {
  const existing = getEditableEmployeeLeaveBalance(employeeId);
  const startsAt = formData.get("leaveStartsAt");
  const balanceData = {
    id: existing?.id || `lb${Date.now()}`,
    employeeId,
    year: Number(startsAt.slice(0, 4)),
    sickLeaveDays: Number(formData.get("sickLeaveDays")),
    personalLeaveDays: Number(formData.get("personalLeaveDays")),
    annualLeaveDays: Number(formData.get("annualLeaveDays")),
    startsAt,
    expiresAt: formData.get("leaveExpiresAt"),
    note: existing?.note || ""
  };
  const existingIndex = state.leaveBalances.findIndex((balance) => balance.id === balanceData.id);
  if (existingIndex >= 0) {
    state.leaveBalances[existingIndex] = balanceData;
  } else {
    state.leaveBalances.push(balanceData);
  }
}

function editShift(id) {
  const shift = state.shifts.find((item) => item.id === id);
  if (!shift) return;
  const form = document.getElementById("shiftForm");
  form.elements.id.value = shift.id;
  form.elements.name.value = shift.name;
  form.elements.start.value = shift.start;
  form.elements.end.value = shift.end;
  form.elements.breakMinutes.value = shift.breakMinutes;
  form.elements.role.value = shift.role;
  form.elements.color.value = shift.color;
  state.editingShiftId = id;
  document.getElementById("shiftFormTitle").textContent = `修改班別：${shift.name}`;
  document.getElementById("shiftSubmitBtn").textContent = "儲存修改";
  document.getElementById("cancelShiftEditBtn").hidden = false;
}

function deleteShift(id) {
  const shift = state.shifts.find((item) => item.id === id);
  if (!shift) return;
  if (!confirm(`確定刪除班別 ${shift.name}？所有排班格中的此班別也會移除。`)) return;
  state.shifts = state.shifts.filter((item) => item.id !== id);
  Object.values(state.schedule).forEach((cell) => {
    cell.shifts = cell.shifts.filter((shiftId) => shiftId !== id);
  });
  if (state.editingShiftId === id) resetShiftForm();
  afterDataChange();
}

function resetShiftForm() {
  const form = document.getElementById("shiftForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.start.value = "10:00";
  form.elements.end.value = "18:00";
  form.elements.breakMinutes.value = 60;
  form.elements.role.value = "專員";
  form.elements.color.value = "#f6b73c";
  state.editingShiftId = null;
  document.getElementById("shiftFormTitle").textContent = "新增班別";
  document.getElementById("shiftSubmitBtn").textContent = "新增班別";
  document.getElementById("cancelShiftEditBtn").hidden = true;
}

function saveLeaveBalance(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get("id") || `lb${Date.now()}`;
  const balanceData = {
    id,
    employeeId: formData.get("employeeId"),
    year: Number(formData.get("year")),
    sickLeaveDays: Number(formData.get("sickLeaveDays")),
    personalLeaveDays: Number(formData.get("personalLeaveDays")),
    annualLeaveDays: Number(formData.get("annualLeaveDays")),
    startsAt: formData.get("startsAt"),
    expiresAt: formData.get("expiresAt"),
    note: formData.get("note").trim()
  };
  const existingIndex = state.leaveBalances.findIndex((balance) => balance.id === id);
  if (existingIndex >= 0) {
    state.leaveBalances[existingIndex] = balanceData;
  } else {
    state.leaveBalances.push(balanceData);
  }
  resetLeaveBalanceForm();
  afterDataChange();
}

function editLeaveBalance(id) {
  const balance = state.leaveBalances.find((item) => item.id === id);
  if (!balance) return;
  const form = document.getElementById("leaveBalanceForm");
  form.elements.id.value = balance.id;
  form.elements.employeeId.value = balance.employeeId;
  form.elements.year.value = balance.year;
  form.elements.sickLeaveDays.value = balance.sickLeaveDays ?? 30;
  form.elements.personalLeaveDays.value = balance.personalLeaveDays ?? 14;
  form.elements.annualLeaveDays.value = balance.annualLeaveDays;
  form.elements.startsAt.value = getLeaveStartsAt(balance);
  form.elements.expiresAt.value = balance.expiresAt;
  form.elements.note.value = balance.note || "";
  state.editingLeaveBalanceId = id;
  document.getElementById("leaveBalanceFormTitle").textContent = "修改休假額度";
  document.getElementById("leaveBalanceSubmitBtn").textContent = "儲存修改";
  document.getElementById("cancelLeaveBalanceEditBtn").hidden = false;
}

function deleteLeaveBalance(id) {
  const balance = state.leaveBalances.find((item) => item.id === id);
  if (!balance) return;
  if (!confirm("確定刪除此休假額度？排班格中的休假標記不會被刪除。")) return;
  state.leaveBalances = state.leaveBalances.filter((item) => item.id !== id);
  if (state.editingLeaveBalanceId === id) resetLeaveBalanceForm();
  afterDataChange();
}

function resetLeaveBalanceForm() {
  const form = document.getElementById("leaveBalanceForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.year.value = Number(state.month.slice(0, 4));
  form.elements.sickLeaveDays.value = 30;
  form.elements.personalLeaveDays.value = 14;
  form.elements.annualLeaveDays.value = 7;
  form.elements.startsAt.value = `${state.month.slice(0, 4)}-01-01`;
  form.elements.expiresAt.value = `${state.month.slice(0, 4)}-12-31`;
  form.elements.note.value = "";
  state.editingLeaveBalanceId = null;
  document.getElementById("leaveBalanceFormTitle").textContent = "新增休假額度";
  document.getElementById("leaveBalanceSubmitBtn").textContent = "新增休假額度";
  document.getElementById("cancelLeaveBalanceEditBtn").hidden = true;
}

function getLeaveBalanceSummaryText(employeeId) {
  const balance = state.leaveBalances.find((item) => item.employeeId === employeeId && isBalanceVisibleInMonth(item, state.month));
  if (!balance) return "休假：未設定";
  return trackedLeaveTypes.map((leave) => {
    const usage = getLeaveUsage(balance, leave);
    return `${leave.type}剩 ${formatDays(usage.remaining)} 天`;
  }).join(" / ") + `，期間 ${getLeavePeriodText(balance)}`;
}

function getLeaveUsage(balance, leave) {
  const dates = [];
  Object.keys(state.schedule).forEach((key) => {
    const parts = key.split(":");
    const employeeId = parts[1];
    const date = parts[2];
    const cell = state.schedule[key];
    if (employeeId !== balance.employeeId || !isDateInLeavePeriod(balance, date)) return;
    if (cell.leaveType === leave.type) dates.push(date);
  });
  dates.sort();
  const used = dates.length;
  const quota = Number(balance[leave.quotaKey] ?? 0);
  return {
    dates,
    used,
    quota,
    remaining: Math.max(0, quota - used)
  };
}

function renderLeaveUsageLines(balance) {
  return trackedLeaveTypes.map((leave) => {
    const usage = getLeaveUsage(balance, leave);
    const usedDates = usage.dates.length ? formatUsedDates(usage.dates) : "尚無";
    return `${leave.label}：可用 ${formatDays(usage.quota)} 天 / 已用 ${formatDays(usage.used)} 天 / 剩餘 ${formatDays(usage.remaining)} 天 / 已用日期：${escapeHtml(usedDates)}`;
  });
}

function getLeaveStartsAt(balance) {
  return balance.startsAt || `${balance.year}-01-01`;
}

function getLeavePeriodText(balance) {
  return `${getLeaveStartsAt(balance)} 至 ${balance.expiresAt}`;
}

function isDateInLeavePeriod(balance, date) {
  return date >= getLeaveStartsAt(balance) && date <= balance.expiresAt;
}

function isBalanceVisibleInMonth(balance, month) {
  const days = getDaysInMonth(month);
  const monthStart = days[0];
  const monthEnd = days[days.length - 1];
  return getLeaveStartsAt(balance) <= monthEnd && balance.expiresAt >= monthStart;
}

function formatUsedDates(dates) {
  return dates.map((date) => date.slice(5).replace("-", "/")).join("、");
}

function getLeaveExpiryClass(expiresAt) {
  const today = new Date();
  const expiry = new Date(`${expiresAt}T00:00:00`);
  const daysLeft = Math.ceil((expiry - today) / MS_PER_DAY);
  if (daysLeft < 0) return "severity-block";
  if (daysLeft <= 30) return "severity-warn";
  return "severity-ok";
}

function formatDays(value) {
  return Number(value).toFixed(1).replace(/\\.0$/, "");
}

function runComplianceLegacy() {
  const results = [];
  const days = getDaysInMonth(state.month);
  state.employees.forEach((employee) => {
    let consecutive = 0;
    let previousLastEnd = null;
    let monthlyOvertime = 0;
    const weekBuckets = new Map();

    days.forEach((date) => {
      const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
      const shifts = cell.shifts.map(getShift).filter(Boolean);
      const dayHours = shifts.reduce((sum, shift) => sum + workHours(shift), 0);
      const working = dayHours > 0;
      if (dayHours > 8) monthlyOvertime += dayHours - 8;

      if (dayHours > 12) {
        results.push(compliance(employee.id, date, "DAY_12H", "block", `當日排班 ${dayHours.toFixed(1)} 小時，含加班不得超過 12 小時。`, "縮短班段或改由其他員工支援。"));
      } else if (dayHours > 8) {
        results.push(compliance(employee.id, date, "DAY_8H", "warn", `當日排班 ${dayHours.toFixed(1)} 小時，超過一般正常工時 8 小時。`, "確認是否屬加班並保留同意紀錄。"));
      }

      shifts.forEach((shift) => {
        if (rawDurationHours(shift) > 4 && shift.breakMinutes < 30) {
          results.push(compliance(employee.id, date, "REST_30M", "warn", `${shift.name} 連續工作超過 4 小時，但休息少於 30 分鐘。`, "調整班中休息時間。"));
        }
      });

      if (previousLastEnd && shifts.length) {
        const firstStart = getShiftStart(date, shifts[0]);
        const restHours = (firstStart - previousLastEnd) / (60 * 60 * 1000);
        if (restHours < 11) {
          results.push(compliance(employee.id, date, "SHIFT_11H", "warn", `換班間隔僅 ${restHours.toFixed(1)} 小時，低於 11 小時原則。`, "調整前後班別或取得必要程序紀錄。"));
        }
      }

      if (working) {
        consecutive += 1;
      } else {
        consecutive = 0;
      }
      if (consecutive > 6) {
        results.push(compliance(employee.id, date, "CONSEC_6D", "block", "連續出勤超過 6 日。", "安排例假或休息日中斷連續出勤。"));
      }

      const weekKey = getWeekKey(date);
      if (!weekBuckets.has(weekKey)) weekBuckets.set(weekKey, { hours: 0, rest: 0, regular: 0 });
      const bucket = weekBuckets.get(weekKey);
      bucket.hours += dayHours;
      if (cell.leaveType === "例假") bucket.regular += 1;
      if (cell.leaveType === "例假" || cell.leaveType === "休息日" || cell.leaveType === "休") bucket.rest += 1;

      if (holidayDates.has(date) && working) {
        results.push(compliance(employee.id, date, "HOLIDAY_WORK", "warn", "國定假日依法應休假；若安排出勤，需確認勞工同意並依法加倍發給工資或辦理補休。", "請在人資紀錄中註明同意、加倍工資或補休處理。"));
      }

      previousLastEnd = shifts.length ? getShiftEnd(date, shifts[shifts.length - 1]) : previousLastEnd;
    });

    weekBuckets.forEach((bucket, weekKey) => {
      if (bucket.hours > employee.contractHours) {
        results.push(compliance(employee.id, weekKey, "WEEK_CONTRACT", "warn", `本週排班 ${bucket.hours.toFixed(1)} 小時，超過契約工時 ${employee.contractHours} 小時。`, "確認是否需要調班或加班程序。"));
      }
      if (bucket.hours > 40) {
        results.push(compliance(employee.id, weekKey, "WEEK_40H", "warn", `本週排班 ${bucket.hours.toFixed(1)} 小時，超過一般正常工時 40 小時。`, "降低本週班段或確認加班。"));
      }
      if (bucket.regular < 1) {
        results.push(compliance(employee.id, weekKey, "REGULAR_DAY", "block", "本 7 日週期未標示例假。", "至少安排 1 日例假。"));
      }
      if (bucket.rest < 2) {
        results.push(compliance(employee.id, weekKey, "REST_DAY", "block", "本 7 日週期休息標記不足 2 日。", "補足例假與休息日。"));
      }
    });

    if (monthlyOvertime > 46) {
      results.push(compliance(employee.id, state.month, "MONTH_OT_46H", "block", `本月加班風險 ${monthlyOvertime.toFixed(1)} 小時，超過 46 小時。`, "調整跨週排班並重新檢核。"));
    }
  });
  return results;
}

function runCompliance() {
  const results = [];
  const days = getDaysInMonth(state.month);
  state.employees.forEach((employee) => {
    let consecutive = 0;
    let previousLastEnd = null;
    let monthlyOvertime = 0;
    const weekBuckets = new Map();
    const twoWeekBuckets = new Map();
    const fourWeekBuckets = new Map();

    days.forEach((date) => {
      const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
      const shifts = cell.shifts.map(getShift).filter(Boolean);
      const dayHours = shifts.reduce((sum, shift) => sum + workHours(shift), 0);
      const working = dayHours > 0;
      if (dayHours > 10) monthlyOvertime += dayHours - 10;

      if (dayHours > 12) {
        results.push(compliance(employee.id, date, "DAY_12H", "block", `當日排班 ${dayHours.toFixed(1)} 小時，正常工時加延長工時不得超過 12 小時。`, "縮短班段或改由其他員工支援。"));
      } else if (dayHours > 10) {
        results.push(compliance(employee.id, date, "DAY_10H", "warn", `當日排班 ${dayHours.toFixed(1)} 小時，超過四週變形工時單日正常工時 10 小時。`, "超過 10 小時部分需列為延長工時，且當日延長工時不得超過 2 小時。"));
      }

      shifts.forEach((shift) => {
        if (rawDurationHours(shift) > 4 && shift.breakMinutes < 30) {
          results.push(compliance(employee.id, date, "REST_30M", "warn", `${shift.name} 連續工作超過 4 小時，休息未達 30 分鐘。`, "調整班中休息時間。"));
        }
      });

      if (previousLastEnd && shifts.length) {
        const firstStart = getShiftStart(date, shifts[0]);
        const restHours = (firstStart - previousLastEnd) / (60 * 60 * 1000);
        if (restHours < 11) {
          results.push(compliance(employee.id, date, "SHIFT_11H", "warn", `換班間隔 ${restHours.toFixed(1)} 小時，少於 11 小時。`, "調整前後班別或由其他員工支援。"));
        }
      }

      consecutive = working ? consecutive + 1 : 0;
      if (consecutive > 12) {
        results.push(compliance(employee.id, date, "CONSEC_12D", "block", "四週變形工時下連續出勤不得超過 12 日。", "調整例假與休息日，避免連續上班超過 12 天。"));
      }

      const weekKey = getWeekKey(date);
      if (!weekBuckets.has(weekKey)) weekBuckets.set(weekKey, { rest: 0 });
      const weekBucket = weekBuckets.get(weekKey);

      const twoWeekKey = getCycleKey(date, days[0], 14, "2W");
      if (!twoWeekBuckets.has(twoWeekKey)) twoWeekBuckets.set(twoWeekKey, { regular: 0, days: 0 });
      const twoWeekBucket = twoWeekBuckets.get(twoWeekKey);
      twoWeekBucket.days += 1;

      const fourWeekKey = getCycleKey(date, days[0], 28, "4W");
      if (!fourWeekBuckets.has(fourWeekKey)) fourWeekBuckets.set(fourWeekKey, { hours: 0, rest: 0, regular: 0, off: 0, days: 0 });
      const fourWeekBucket = fourWeekBuckets.get(fourWeekKey);
      fourWeekBucket.days += 1;
      fourWeekBucket.hours += dayHours;

      if (cell.leaveType === "例假") {
        twoWeekBucket.regular += 1;
        fourWeekBucket.regular += 1;
      }
      if (cell.leaveType === "休息日") fourWeekBucket.rest += 1;
      if (cell.leaveType === "例假" || cell.leaveType === "休息日" || cell.leaveType === "休") {
        weekBucket.rest += 1;
        fourWeekBucket.off += 1;
      }

      if (holidayDates.has(date) && working) {
        results.push(compliance(employee.id, date, "HOLIDAY_WORK", "warn", "國定假日依法應休假；若安排出勤，需確認勞工同意並依法加倍發給工資或辦理補休。", "請在人資紀錄中註明同意、加倍工資或補休處理。"));
      }

      previousLastEnd = shifts.length ? getShiftEnd(date, shifts[shifts.length - 1]) : previousLastEnd;
    });

    weekBuckets.forEach((bucket, weekKey) => {
      if (bucket.rest < 1) {
        results.push(compliance(employee.id, weekKey, "WEEK_REST_MARK", "warn", "本週未排任何例假或休息日，可能造成連續出勤風險。", "以四週週期重新檢查例假與休息日分布。"));
      }
    });

    twoWeekBuckets.forEach((bucket, periodKey) => {
      if (bucket.days < 14) return;
      if (bucket.regular < 2) {
        results.push(compliance(employee.id, periodKey, "TWO_WEEK_REGULAR_2D", "block", "四週變形工時每兩週內至少需有 2 天例假日。", "補足兩週週期內的例假日。"));
      }
    });

    fourWeekBuckets.forEach((bucket, periodKey) => {
      if (bucket.days < 28) return;
      const normalLimit = Math.min(160, employee.contractHours * 4);
      if (bucket.hours > normalLimit) {
        results.push(compliance(employee.id, periodKey, "FOUR_WEEK_160H", "block", `四週總工時 ${bucket.hours.toFixed(1)} 小時，超過四週正常工時上限 ${normalLimit.toFixed(1)} 小時。`, "降低四週週期內班段；超出四週正常工時部分需另依加班或休息日出勤處理。"));
      }
      if (bucket.off < 8) {
        results.push(compliance(employee.id, periodKey, "FOUR_WEEK_OFF_8D", "block", `四週內例假加休息日共 ${bucket.off} 天，少於 8 天。`, "四週內需安排合計 8 天例假/休息日。"));
      }
      if (bucket.regular < 4) {
        results.push(compliance(employee.id, periodKey, "FOUR_WEEK_REGULAR_4D", "block", `四週內例假 ${bucket.regular} 天，少於 4 天。`, "四週內需排入至少 4 天例假，且每兩週至少 2 天。"));
      }
      if (bucket.rest < 4) {
        results.push(compliance(employee.id, periodKey, "FOUR_WEEK_REST_4D", "block", `四週內休息日 ${bucket.rest} 天，少於 4 天。`, "四週內需排入至少 4 天休息日。"));
      }
    });

    if (monthlyOvertime > 46) {
      results.push(compliance(employee.id, state.month, "MONTH_OT_46H", "block", `本月延長工時估計 ${monthlyOvertime.toFixed(1)} 小時，超過 46 小時。`, "調整月內班表或確認延長工時程序。"));
    }
  });
  return results;
}

function compliance(employeeId, scope, code, severity, message, suggestion) {
  return { employeeId, scope, rawCode: code, code: getComplianceCodeLabel(code), severity, message, suggestion, acknowledged: false };
}

function getComplianceCodeLabel(code) {
  return complianceCodeLabels[code] || code;
}

function getAlertActionKey(alert) {
  return alert.rawCode || alert.code;
}

function getCellAlertActions(employeeId, date) {
  const cell = state.schedule[cellKey(employeeId, date)] || emptyCell();
  return cell.complianceActions || {};
}

function isAlertHandled(alert, actions) {
  return Boolean((actions[getAlertActionKey(alert)] || "").trim());
}

function getCellAlertStatus(employeeId, date, alerts) {
  const actions = getCellAlertActions(employeeId, date);
  const handled = alerts.filter((alert) => isAlertHandled(alert, actions)).length;
  return { total: alerts.length, handled, pending: alerts.length - handled };
}

function renderCellAlertBadge(status) {
  if (!status.total) return "";
  if (!status.pending) return `<div class="cell-alert handled">${status.total} 項警示（已處理）</div>`;
  if (status.handled) return `<div class="cell-alert">${status.pending} 項警示 / ${status.handled} 項已處理</div>`;
  return `<div class="cell-alert">${status.pending} 項警示</div>`;
}

function renderMobileAlertBadge(status) {
  if (!status.total) return "";
  if (!status.pending) return `<b class="handled">${status.total} 項警示（已處理）</b>`;
  if (status.handled) return `<b>${status.pending} 項警示 / ${status.handled} 項已處理</b>`;
  return `<b>${status.pending} 項警示</b>`;
}

function getComplianceActionText(item) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.scope)) return "";
  const actions = getCellAlertActions(item.employeeId, item.scope);
  return (actions[getAlertActionKey(item)] || "").trim();
}

function getDatabaseSnapshot() {
  return {
    employees: state.employees,
    shifts: state.shifts,
    schedule: state.schedule,
    leaveBalances: state.leaveBalances,
    leaveRecords: state.leaveRecords
  };
}

function applyDatabaseSnapshot(data) {
  if (!data) return;
  if (Array.isArray(data.employees) && data.employees.length) state.employees = data.employees;
  if (Array.isArray(data.shifts) && data.shifts.length) state.shifts = data.shifts;
  if (data.schedule && Object.keys(data.schedule).length) {
    state.schedule = Object.fromEntries(Object.entries(data.schedule).map(([key, cell]) => [key, normalizeCell(cell)]));
  }
  if (Array.isArray(data.leaveBalances) && data.leaveBalances.length) state.leaveBalances = data.leaveBalances;
  if (Array.isArray(data.leaveRecords)) state.leaveRecords = data.leaveRecords;
}

function hasRemoteData(data) {
  return Boolean(
    (Array.isArray(data?.employees) && data.employees.length) ||
    (Array.isArray(data?.shifts) && data.shifts.length) ||
    (data?.schedule && Object.keys(data.schedule).length) ||
    (Array.isArray(data?.leaveBalances) && data.leaveBalances.length)
  );
}

function normalizeCell(cell) {
  return {
    shifts: Array.isArray(cell?.shifts) ? cell.shifts : [],
    leaveType: cell?.leaveType || "",
    note: cell?.note || "",
    complianceActions: cell?.complianceActions || {},
    createdBy: cell?.createdBy || "",
    updatedBy: cell?.updatedBy || ""
  };
}

function loadLocalSnapshot() {
  try {
    const cached = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!cached) return;
    const parsed = JSON.parse(cached);
    applyDatabaseSnapshot(parsed.data);
    state.cloud.lastSavedAt = parsed.savedAt || "";
    state.cloud.message = "已載入本機暫存，正在同步雲端";
  } catch (error) {
    console.warn("Local cache load failed", error);
  }
}

function saveLocalSnapshot() {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      data: getDatabaseSnapshot()
    }));
  } catch (error) {
    console.warn("Local cache save failed", error);
  }
}

async function loadCloudData() {
  setCloudStatus("loading", "正在讀取 Google Sheets");
  try {
    const result = await sheetsJsonp({ action: "load" });
    if (!result.ok) throw new Error(result.error || "load failed");
    if (hasRemoteData(result.data)) {
      applyDatabaseSnapshot(result.data);
      seedSchedule();
      saveLocalSnapshot();
      setCloudStatus("saved", "Sheets 已同步", new Date().toISOString());
      renderAll();
    } else {
      saveLocalSnapshot();
      await persistCloudData("初始化 Sheets");
    }
  } catch (error) {
    setCloudStatus("error", "讀取失敗，使用本機資料");
    renderCloudStatus();
  }
}

function afterDataChange() {
  saveLocalSnapshot();
  renderAll();
  persistCloudData();
}

async function persistCloudData(message = "同步 Sheets 中") {
  setCloudStatus("saving", message);
  renderCloudStatus();
  try {
    await fetch(SHEETS_API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveAll", data: getDatabaseSnapshot() })
    });
    setCloudStatus("saved", "Sheets 已儲存", new Date().toISOString());
    saveLocalSnapshot();
  } catch (error) {
    setCloudStatus("error", "儲存失敗，已暫存本機");
  }
  renderCloudStatus();
}

function sheetsJsonp(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `kengSheetsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("讀取逾時"));
    }, 15000);
    const query = new URLSearchParams({ ...params, callback: callbackName });
    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("無法連線到 Apps Script"));
    };
    script.src = `${SHEETS_API_URL}?${query.toString()}`;
    document.body.appendChild(script);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
  });
}

function setCloudStatus(status, message, savedAt = state.cloud.lastSavedAt) {
  state.cloud = { status, message, lastSavedAt: savedAt || "" };
}

function renderCloudStatus() {
  const element = document.getElementById("cloudStatus");
  if (!element) return;
  const timeText = state.cloud.lastSavedAt ? ` · ${new Date(state.cloud.lastSavedAt).toLocaleString("zh-TW")}` : "";
  element.className = `cloud-status ${state.cloud.status}`;
  element.textContent = `${state.cloud.message}${timeText}`;
}

function getEmployeeTotals() {
  const totals = {};
  state.employees.forEach((employee) => {
    totals[employee.id] = { hours: 0, workDays: 0, leaveDays: 0, contractHours: employee.contractHours };
    getDaysInMonth(state.month).forEach((date) => {
      const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
      const hours = cell.shifts.map(getShift).filter(Boolean).reduce((sum, shift) => sum + workHours(shift), 0);
      totals[employee.id].hours += hours;
      if (hours > 0) totals[employee.id].workDays += 1;
      if (cell.leaveType) totals[employee.id].leaveDays += 1;
    });
  });
  return totals;
}

function groupByCell(results) {
  return results.reduce((map, item) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.scope)) {
      const key = cellKey(item.employeeId, item.scope);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, {});
}

function exportCsv() {
  const days = getDaysInMonth(state.month);
  const rows = [["姓名", "職稱", ...days, ...summaryColumns.map((column) => column.label)]];
  state.employees.forEach((employee) => {
    const summary = getEmployeeMonthSummary(employee.id, days);
    rows.push([
      employee.name,
      employee.title,
      ...days.map((date) => {
        const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
        const shiftText = cell.shifts.map((id) => {
          const shift = getShift(id);
          return shift ? `${shift.name} ${shift.start}-${shift.end}` : "";
        }).filter(Boolean).join(" / ");
        return [cell.leaveType, shiftText, cell.note].filter(Boolean).join(" ");
      }),
      ...summaryColumns.map((column) => formatSummaryValue(summary[column.key], column))
    ]);
  });
  rows.push([]);
  rows.push(["法遵警示"]);
  rows.push(["員工", "範圍", "嚴重度", "規則", "說明", "建議"]);
  runCompliance().forEach((item) => {
    const employee = state.employees.find((entry) => entry.id === item.employeeId);
    rows.push([employee.name, item.scope, item.severity === "block" ? "阻擋" : "警告", getComplianceCodeLabel(item.code), item.message, item.suggestion]);
  });
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `耕讀園排班_${state.month}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getDaysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: count }, (_, index) => `${year}-${String(monthNumber).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`);
}

function getWeekKey(date) {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDay();
  const start = new Date(d.getTime() - day * MS_PER_DAY);
  const end = new Date(start.getTime() + 6 * MS_PER_DAY);
  return `${formatDate(start)}~${formatDate(end)}`;
}

function getCycleKey(date, cycleStart, cycleDays, prefix) {
  const start = new Date(`${cycleStart}T00:00:00`);
  const current = new Date(`${date}T00:00:00`);
  const diffDays = Math.floor((current - start) / MS_PER_DAY);
  const index = Math.floor(diffDays / cycleDays);
  const periodStart = new Date(start.getTime() + index * cycleDays * MS_PER_DAY);
  const periodEnd = new Date(periodStart.getTime() + (cycleDays - 1) * MS_PER_DAY);
  return `${prefix} ${formatDate(periodStart)}~${formatDate(periodEnd)}`;
}

function getShift(id) {
  return state.shifts.find((shift) => shift.id === id);
}

function workHours(shift) {
  return Math.max(0, rawDurationHours(shift) - shift.breakMinutes / 60);
}

function rawDurationHours(shift) {
  const start = minutes(shift.start);
  let end = minutes(shift.end);
  if (end <= start || shift.crossesMidnight) end += 24 * 60;
  return (end - start) / 60;
}

function getShiftStart(date, shift) {
  const [hour, minute] = shift.start.split(":").map(Number);
  return new Date(`${date}T00:00:00`).getTime() + (hour * 60 + minute) * 60 * 1000;
}

function getShiftEnd(date, shift) {
  return getShiftStart(date, shift) + rawDurationHours(shift) * 60 * 60 * 1000;
}

function minutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function cellKey(employeeId, date) {
  return `${state.month}:${employeeId}:${date}`;
}

function emptyCell() {
  return { shifts: [], leaveType: "", note: "", complianceActions: {}, createdBy: "", updatedBy: "" };
}

function cloneCell(cell) {
  return { ...cell, shifts: [...cell.shifts], complianceActions: { ...(cell.complianceActions || {}) } };
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();

