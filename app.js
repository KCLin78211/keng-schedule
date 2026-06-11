const MS_PER_DAY = 24 * 60 * 60 * 1000;
const state = {
  month: "2026-06",
  activeTab: "schedule",
  selectedCell: null,
  copiedCell: null,
  scheduleEmployeeFilter: "all",
  mobileScheduleView: "cards",
  employees: [
    { id: "e1", name: "季恆", title: "襄理", type: "正職", startDate: "2022-03-01", policy: "一般工時", contractHours: 40, active: true, department: "台南門市" },
    { id: "e2", name: "章伶", title: "主任", type: "正職", startDate: "2021-11-15", policy: "一般工時", contractHours: 40, active: true, department: "台南門市" },
    { id: "e3", name: "祖華", title: "儲備", type: "正職", startDate: "2024-01-10", policy: "一般工時", contractHours: 40, active: true, department: "台南門市" },
    { id: "e4", name: "子捷", title: "專員", type: "正職", startDate: "2024-05-20", policy: "一般工時", contractHours: 40, active: true, department: "台南門市" },
    { id: "e5", name: "靜怡", title: "專員", type: "正職", startDate: "2023-09-01", policy: "一般工時", contractHours: 40, active: true, department: "台南門市" },
    { id: "e6", name: "若芸", title: "早計", type: "兼職", startDate: "2025-02-18", policy: "一般工時", contractHours: 24, active: true, department: "台南門市" },
    { id: "e7", name: "柏亨", title: "晚計", type: "兼職", startDate: "2025-08-01", policy: "一般工時", contractHours: 20, active: true, department: "台南門市" }
  ],
  shifts: [
    { id: "s1", name: "早A", start: "10:00", end: "17:00", breakMinutes: 60, crossesMidnight: false, role: "早計", color: "#e8af32" },
    { id: "s2", name: "中班", start: "11:30", end: "20:00", breakMinutes: 60, crossesMidnight: false, role: "專員", color: "#5aa17f" },
    { id: "s3", name: "晚班", start: "13:00", end: "21:30", breakMinutes: 60, crossesMidnight: false, role: "晚計", color: "#4d75a8" },
    { id: "s4", name: "全K", start: "11:00", end: "21:30", breakMinutes: 90, crossesMidnight: false, role: "儲備", color: "#c87038" },
    { id: "s5", name: "超長支援", start: "09:00", end: "23:00", breakMinutes: 60, crossesMidnight: false, role: "主任", color: "#b3261e" }
  ],
  schedule: {},
  leaveRecords: [],
  editingEmployeeId: null,
  editingShiftId: null
};

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
const summaryColumns = [
  { key: "sick", label: "病", leaveType: "病" },
  { key: "personal", label: "事", leaveType: "事" },
  { key: "official", label: "公", leaveType: "公" },
  { key: "workDays", label: "出勤" }
];
const holidayDates = new Set(["2026-06-19"]);

function init() {
  seedSchedule();
  bindEvents();
  renderAll();
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
  document.getElementById("cancelEmployeeEditBtn").addEventListener("click", resetEmployeeForm);
  document.getElementById("cancelShiftEditBtn").addEventListener("click", resetShiftForm);
}

function seedSchedule() {
  if (Object.keys(state.schedule).some((key) => key.startsWith(state.month))) return;
  const days = getDaysInMonth(state.month);
  const useJuneExample = state.month === "2026-06";
  state.employees.forEach((employee, employeeIndex) => {
    days.forEach((date, index) => {
      const day = index + 1;
      const key = cellKey(employee.id, date);
      const dow = new Date(`${date}T00:00:00`).getDay();
      const cell = { shifts: [], leaveType: "", note: "", createdBy: "system", updatedBy: "system" };

      if (useJuneExample) {
        if (dow === 0) cell.leaveType = day % 3 === 0 ? "休息日" : "休";
        if (dow === 1 && employeeIndex % 2 === 0) cell.leaveType = "例假";
        if (!cell.leaveType && (employeeIndex + day) % 5 !== 0) {
          cell.shifts = [pickShift(employee, day)];
        }
        if (employee.id === "e2" && day >= 1 && day <= 7) cell.shifts = ["s3"];
        if (employee.id === "e2" && day === 8) cell.shifts = ["s5"];
        if (employee.id === "e3" && [4, 5, 6, 7].includes(day)) cell.leaveType = "特休";
        if (employee.id === "e6" && [2, 3, 4, 5, 6, 7].includes(day)) cell.shifts = ["s1"];
        if (holidayDates.has(date) && !cell.leaveType) cell.note = "國定假日出勤";
      }

      state.schedule[key] = cell;
    });
  });
}

function pickShift(employee, day) {
  if (employee.title.includes("早")) return "s1";
  if (employee.title.includes("晚")) return "s3";
  if (employee.title === "主任") return day % 4 === 0 ? "s4" : "s3";
  if (employee.title === "儲備") return day % 3 === 0 ? "s4" : "s2";
  return day % 2 === 0 ? "s2" : "s1";
}

function renderAll() {
  renderTabs();
  renderLegend();
  populateDialogOptions();
  renderSchedule();
  renderDashboard();
  renderAdmin();
}

function renderTabs() {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.activeTab));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === state.activeTab));
  applyMobileScheduleView();
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
  const visibleEmployees = state.employees.filter((employee) => (
    employee.active && (state.scheduleEmployeeFilter === "all" || employee.id === state.scheduleEmployeeFilter)
  ));
  const head = [
    `<tr><th class="employee-head">姓名 / 職稱</th>`,
    ...days.map((date) => {
      const d = new Date(`${date}T00:00:00`);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      return `<th class="date-head ${weekend ? "weekend" : ""}">${d.getDate()}<span class="weekday">${weekdays[d.getDay()]}</span></th>`;
    }),
    ...summaryColumns.map((column) => `<th class="summary-head">${column.label}</th>`),
    `</tr>`
  ].join("");

  const body = visibleEmployees.map((employee) => {
    const row = days.map((date) => renderCell(employee, date, compliance[cellKey(employee.id, date)] || []));
    const summary = renderSummaryCells(employee, days);
    return `<tr><td class="employee-cell"><div class="employee-name">${escapeHtml(employee.name)}</div><div class="employee-meta">${escapeHtml(employee.title)} · ${employee.type} · ${employee.contractHours}h/週</div></td>${row.join("")}${summary}</tr>`;
  }).join("") || `<tr><td class="employee-cell">沒有符合條件的員工</td><td colspan="${days.length + summaryColumns.length}"></td></tr>`;

  table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  table.querySelectorAll(".day-cell").forEach((cell) => {
    cell.addEventListener("click", () => handleCellClick(cell.dataset.employeeId, cell.dataset.date));
  });
  renderMobileSchedule(days, visibleEmployees, compliance);
}

function renderSummaryCells(employee, days) {
  const counts = getEmployeeMonthSummary(employee.id, days);
  return summaryColumns.map((column) => (
    `<td class="summary-cell">${counts[column.key] || ""}</td>`
  )).join("");
}

function getEmployeeMonthSummary(employeeId, days) {
  const counts = { sick: 0, personal: 0, official: 0, workDays: 0 };
  days.forEach((date) => {
    const cell = state.schedule[cellKey(employeeId, date)] || emptyCell();
    if (cell.leaveType === "病") counts.sick += 1;
    if (cell.leaveType === "事") counts.personal += 1;
    if (cell.leaveType === "公") counts.official += 1;
    if (cell.shifts.length) counts.workDays += 1;
  });
  return counts;
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
  const alertHtml = alerts.length ? `<div class="cell-alert">${alerts.length} 項警示</div>` : "";
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  return `<td class="day-cell ${weekend ? "weekend" : ""}" data-employee-id="${employee.id}" data-date="${date}">${leaveHtml}${shiftHtml}${noteHtml}${alertHtml}</td>`;
}

function renderMobileSchedule(days, visibleEmployees, compliance) {
  const list = document.getElementById("mobileScheduleList");
  const cards = [];
  days.forEach((date) => {
    visibleEmployees.forEach((employee) => {
      const cell = state.schedule[cellKey(employee.id, date)] || emptyCell();
      const alerts = compliance[cellKey(employee.id, date)] || [];
      const hasContent = cell.shifts.length || cell.leaveType || cell.note || alerts.length;
      if (!hasContent) return;
      const d = new Date(`${date}T00:00:00`);
      const shiftText = cell.shifts.map((shiftId) => {
        const shift = getShift(shiftId);
        return shift ? `<span>${escapeHtml(shift.name)} ${shift.start}-${shift.end} · ${workHours(shift).toFixed(1)}h</span>` : "";
      }).join("");
      cards.push(`
        <button class="mobile-schedule-card" type="button" data-employee-id="${employee.id}" data-date="${date}">
          <div class="mobile-card-date">
            <strong>${d.getDate()}</strong>
            <span>${weekdays[d.getDay()]}</span>
          </div>
          <div class="mobile-card-main">
            <strong>${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</strong>
            <div>${shiftText || `<span class="mobile-muted">${escapeHtml(cell.leaveType || "未排班")}</span>`}</div>
            ${cell.leaveType ? `<em>${escapeHtml(cell.leaveType)}</em>` : ""}
            ${cell.note ? `<small>${escapeHtml(cell.note)}</small>` : ""}
            ${alerts.length ? `<b>${alerts.length} 項警示</b>` : ""}
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
  const key = cellKey(employeeId, date);
  if (document.getElementById("copyMode").checked && state.copiedCell) {
    state.schedule[key] = cloneCell(state.copiedCell);
    state.schedule[key].updatedBy = document.getElementById("roleView").value;
    renderAll();
    return;
  }
  state.selectedCell = { employeeId, date };
  state.copiedCell = cloneCell(state.schedule[key] || emptyCell());
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
  renderCellAlertDetails(cellAlerts);
  document.getElementById("cellDialog").showModal();
}

function renderCellAlertDetails(alerts) {
  const alertBox = document.getElementById("cellAlertDetails");
  if (!alerts.length) {
    alertBox.innerHTML = `<div class="cell-alert-empty">目前沒有此日期的法遵警示。</div>`;
    return;
  }
  alertBox.innerHTML = alerts.map((alert) => (
    `<article class="cell-alert-item ${alert.severity === "block" ? "severity-block" : "severity-warn"}"><div><strong>${alert.severity === "block" ? "阻擋" : "警告"} · ${escapeHtml(alert.code)}</strong><span>${escapeHtml(alert.message)}</span></div><em>${escapeHtml(alert.suggestion)}</em></article>`
  )).join("");
}

function saveDialogCell() {
  if (!state.selectedCell) return;
  const selectedShifts = Array.from(document.getElementById("shiftSelect").selectedOptions).map((option) => option.value);
  const role = document.getElementById("roleView").value;
  state.schedule[cellKey(state.selectedCell.employeeId, state.selectedCell.date)] = {
    shifts: selectedShifts,
    leaveType: document.getElementById("leaveType").value,
    note: document.getElementById("noteInput").value.trim(),
    createdBy: role,
    updatedBy: role
  };
  document.getElementById("cellDialog").close();
  renderAll();
}

function clearDialogCell() {
  if (!state.selectedCell) return;
  state.schedule[cellKey(state.selectedCell.employeeId, state.selectedCell.date)] = emptyCell();
  document.getElementById("cellDialog").close();
  renderAll();
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
    createdBy: "quick-schedule",
    updatedBy: "quick-schedule"
  };
  state.scheduleEmployeeFilter = employeeId;
  form.elements.note.value = "";
  form.elements.leaveType.value = "";
  Array.from(form.elements.shiftIds.options).forEach((option) => {
    option.selected = false;
  });
  renderAll();
  state.activeTab = "schedule";
  renderTabs();
}

function populateDialogOptions() {
  const shiftSelect = document.getElementById("shiftSelect");
  shiftSelect.innerHTML = state.shifts.map((shift) => (
    `<option value="${shift.id}">${escapeHtml(shift.name)} ${shift.start}-${shift.end} ${workHours(shift).toFixed(1)}h</option>`
  )).join("");

  const activeEmployees = state.employees.filter((employee) => employee.active);
  const scheduleEmployeeFilter = document.getElementById("scheduleEmployeeFilter");
  const currentScheduleEmployee = state.scheduleEmployeeFilter || "all";
  scheduleEmployeeFilter.innerHTML = `<option value="all">全部員工</option>` + activeEmployees.map((employee) => (
    `<option value="${employee.id}">${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</option>`
  )).join("");
  state.scheduleEmployeeFilter = activeEmployees.some((employee) => employee.id === currentScheduleEmployee) ? currentScheduleEmployee : "all";
  scheduleEmployeeFilter.value = state.scheduleEmployeeFilter;

  const employeeFilter = document.getElementById("employeeFilter");
  const current = employeeFilter.value || "all";
  employeeFilter.innerHTML = `<option value="all">全部</option>` + activeEmployees.map((employee) => (
    `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`
  )).join("");
  employeeFilter.value = activeEmployees.some((employee) => employee.id === current) ? current : "all";

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
}

function renderDashboard() {
  populateDialogOptions();
  const compliance = runCompliance();
  const days = getDaysInMonth(state.month);
  const selectedEmployee = document.getElementById("employeeFilter").value || "all";
  const selectedSeverity = document.getElementById("severityFilter").value || "all";
  const visibleCompliance = compliance.filter((item) => (
    (selectedEmployee === "all" || item.employeeId === selectedEmployee) &&
    (selectedSeverity === "all" || item.severity === selectedSeverity)
  ));
  const totals = getEmployeeTotals();
  const dashboardEmployees = state.employees.filter((employee) => (
    employee.active && (selectedEmployee === "all" || employee.id === selectedEmployee)
  ));
  const monthHours = dashboardEmployees.reduce((sum, employee) => sum + (totals[employee.id]?.hours || 0), 0);
  const overtimeRisk = dashboardEmployees.reduce((sum, employee) => {
    const total = totals[employee.id] || { hours: 0, contractHours: employee.contractHours };
    return sum + Math.max(0, total.hours - total.contractHours * 4);
  }, 0);
  const leaveCount = dashboardEmployees.reduce((sum, employee) => (
    sum + days.filter((date) => ["特休", "請假", "病", "事", "公"].includes((state.schedule[cellKey(employee.id, date)] || emptyCell()).leaveType)).length
  ), 0);

  document.getElementById("metrics").innerHTML = [
    metric("本月總工時", `${monthHours.toFixed(1)}h`),
    metric("阻擋警示", compliance.filter((item) => item.severity === "block").length),
    metric("加班風險", `${overtimeRisk.toFixed(1)}h`),
    metric("休假/請假", `${leaveCount} 天`)
  ].join("");

  document.getElementById("complianceList").innerHTML = visibleCompliance.length
    ? visibleCompliance.map(renderComplianceItem).join("")
    : `<div class="list-item severity-ok"><strong>目前沒有符合篩選條件的警示</strong><span>可切換月份或調整排班後重新檢視。</span></div>`;

  document.getElementById("coverageList").innerHTML = days.map(renderCoverageItem).join("");
  document.getElementById("employeeSummary").innerHTML = dashboardEmployees.map((employee) => {
    const total = totals[employee.id] || { hours: 0, workDays: 0, leaveDays: 0 };
    const severity = total.hours > employee.contractHours * 4 ? "severity-warn" : "severity-ok";
    return `<div class="list-item ${severity}"><strong>${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</strong><span>${total.hours.toFixed(1)}h / ${total.workDays} 出勤日 / ${total.leaveDays} 休假標記</span></div>`;
  }).join("");
}

function metric(label, value) {
  return `<div class="metric-card"><strong>${value}</strong><span>${label}</span></div>`;
}

function renderComplianceItem(item) {
  const employee = state.employees.find((entry) => entry.id === item.employeeId);
  return `<div class="list-item severity-${item.severity}"><strong>${employee.name} · ${item.scope} · ${item.code}</strong><span>${escapeHtml(item.message)}</span><span>${escapeHtml(item.suggestion)}</span></div>`;
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
    `<div class="list-item"><strong>${escapeHtml(employee.name)} · ${escapeHtml(employee.title)}</strong><span>${employee.type} · ${employee.policy} · ${employee.contractHours}h/週 · ${escapeHtml(employee.department)}</span><div class="item-actions"><button class="button secondary" type="button" data-edit-employee="${employee.id}">編輯</button><button class="button danger" type="button" data-delete-employee="${employee.id}">刪除</button></div></div>`
  )).join("");
  document.getElementById("shiftList").innerHTML = state.shifts.map((shift) => (
    `<div class="list-item"><strong><i class="swatch" style="background:${shift.color}"></i> ${escapeHtml(shift.name)}</strong><span>${shift.start}-${shift.end} · 休息 ${shift.breakMinutes} 分 · ${workHours(shift).toFixed(1)}h · ${escapeHtml(shift.role)}</span><div class="item-actions"><button class="button secondary" type="button" data-edit-shift="${shift.id}">編輯</button><button class="button danger" type="button" data-delete-shift="${shift.id}">刪除</button></div></div>`
  )).join("");
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
    policy: "一般工時",
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
  resetEmployeeForm();
  renderAll();
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
  renderAll();
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
  Object.keys(state.schedule).forEach((key) => {
    if (key.includes(`:${id}:`)) delete state.schedule[key];
  });
  if (state.scheduleEmployeeFilter === id) state.scheduleEmployeeFilter = "all";
  if (state.editingEmployeeId === id) resetEmployeeForm();
  renderAll();
}

function resetEmployeeForm() {
  const form = document.getElementById("employeeForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.contractHours.value = 40;
  form.elements.startDate.value = "2025-01-01";
  form.elements.department.value = "台南門市";
  state.editingEmployeeId = null;
  document.getElementById("employeeFormTitle").textContent = "新增員工";
  document.getElementById("employeeSubmitBtn").textContent = "新增員工";
  document.getElementById("cancelEmployeeEditBtn").hidden = true;
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
  renderAll();
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

function runCompliance() {
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
        results.push(compliance(employee.id, date, "HOLIDAY_WORK", "warn", "國定假日安排出勤，第一版僅提示人資確認給付或補休。", "在人資備註中記錄處理方式。"));
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

function compliance(employeeId, scope, code, severity, message, suggestion) {
  return { employeeId, scope, code, severity, message, suggestion, acknowledged: false };
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
      ...summaryColumns.map((column) => summary[column.key] || "")
    ]);
  });
  rows.push([]);
  rows.push(["法遵警示"]);
  rows.push(["員工", "範圍", "嚴重度", "規則", "說明", "建議"]);
  runCompliance().forEach((item) => {
    const employee = state.employees.find((entry) => entry.id === item.employeeId);
    rows.push([employee.name, item.scope, item.severity === "block" ? "阻擋" : "警告", item.code, item.message, item.suggestion]);
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
  return { shifts: [], leaveType: "", note: "", createdBy: "", updatedBy: "" };
}

function cloneCell(cell) {
  return { ...cell, shifts: [...cell.shifts] };
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
