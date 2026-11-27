/**
 * Executive Dashboard KPIs, Aging Alerts, Cross-Module Employee Lookup,
 * Master Lists, and Audit Log queries.
 */

function daysBetweenYmd_(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return 0;
  var m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fromYmd));
  var m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(toYmd));
  if (!m1 || !m2) return 0;
  var t1 = Date.UTC(parseInt(m1[1], 10), parseInt(m1[2], 10) - 1, parseInt(m1[3], 10));
  var t2 = Date.UTC(parseInt(m2[1], 10), parseInt(m2[2], 10) - 1, parseInt(m2[3], 10));
  return Math.floor((t2 - t1) / 86400000);
}

function addToBucket_(map, key, amount) {
  var k = key || 'UNSPECIFIED';
  if (!map[k]) map[k] = { key: k, count: 0, amount: 0 };
  map[k].count++;
  map[k].amount = round2_(map[k].amount + (Number(amount) || 0));
}

function mapToSortedList_(map, sortByAmount) {
  var list = [];
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    list.push(map[keys[i]]);
  }
  list.sort(function(a, b) {
    if (sortByAmount) return b.amount - a.amount;
    return String(a.key).localeCompare(String(b.key));
  });
  return list;
}

function getDashboardSummary_(session, filters) {
  ensureDatabaseReady_();
  filters = filters || {};
  var fYear = filters.year ? String(filters.year).trim() : '';
  var fClient = filters.client ? normalizeClient_(filters.client) : '';
  var today = todayManilaYmd_();
  var bankThreshold = APP_CONFIG.AGING_THRESHOLDS.BANK_CREDIT_DAYS;
  var checkThreshold = APP_CONFIG.AGING_THRESHOLDS.CHECK_ISSUE_DAYS;

  var sssRows = readSheetObjects_(APP_CONFIG.SHEETS.SSS);
  var insRows = readSheetObjects_(APP_CONFIG.SHEETS.INSURANCE);

  var sssKpis = {
    totalClaims: 0,
    totalApprovedAmount: 0,
    totalCreditedAmount: 0,
    totalCheckAmount: 0,
    pendingBankCount: 0,
    pendingBankAmount: 0,
    pendingCheckCount: 0,
    pendingCheckAmount: 0,
    advancedExposureCount: 0,
    advancedExposureAmount: 0,
    varianceCount: 0,
    completedCount: 0
  };

  var insKpis = {
    totalClaims: 0,
    totalReleasedAmount: 0,
    totalReimbursedAmount: 0,
    totalCreditedAmount: 0,
    pendingReimbursementCount: 0,
    pendingReimbursementAmount: 0,
    disallowedBalanceCount: 0,
    disallowedBalanceAmount: 0,
    companyExpenseCount: 0,
    employeeExpenseCount: 0,
    doneCount: 0
  };

  var clientBuckets = {};
  var bankBuckets = {};
  var benefitBuckets = {};
  var monthBuckets = {};
  var agingAlerts = [];

  for (var i = 0; i < sssRows.length; i++) {
    var sr = sssRows[i];
    if (toBool_(sr.is_deleted)) continue;
    var s = sanitizeSssRow_(sr);
    if (fYear && String(s.year) !== fYear) continue;
    if (fClient && normalizeClient_(s.client_project) !== fClient) continue;

    var rel = Number(s.amount_to_release) || 0;
    var cred = s.amount_credited === '' ? 0 : (Number(s.amount_credited) || 0);
    var chk = s.check_amount === '' ? 0 : (Number(s.check_amount) || 0);

    sssKpis.totalClaims++;
    sssKpis.totalApprovedAmount = round2_(sssKpis.totalApprovedAmount + rel);
    sssKpis.totalCreditedAmount = round2_(sssKpis.totalCreditedAmount + cred);
    sssKpis.totalCheckAmount = round2_(sssKpis.totalCheckAmount + chk);

    var isCredited = Boolean(s.date_credited) || (s.bank_status !== 'PENDING');
    var isChecked = Boolean(s.date_of_check) || Boolean(s.check_no);

    if (!isCredited) {
      sssKpis.pendingBankCount++;
      sssKpis.pendingBankAmount = round2_(sssKpis.pendingBankAmount + rel);
      var ageBank = daysBetweenYmd_(s.filing_date, today);
      if (ageBank > bankThreshold) {
        agingAlerts.push({
          module: 'SSS',
          id: s.id,
          employee_name: s.employee_name,
          client: s.client_project,
          ref_no: s.claim_ref_no,
          alert_type: 'AWAITING_BANK_CREDIT',
          days_aged: ageBank,
          amount: rel,
          reference_date: s.filing_date
        });
      }
    }

    if (!isChecked) {
      sssKpis.pendingCheckCount++;
      sssKpis.pendingCheckAmount = round2_(sssKpis.pendingCheckAmount + rel);
      if (s.date_credited) {
        var ageCheck = daysBetweenYmd_(s.date_credited, today);
        if (ageCheck > checkThreshold) {
          agingAlerts.push({
            module: 'SSS',
            id: s.id,
            employee_name: s.employee_name,
            client: s.client_project,
            ref_no: s.claim_ref_no,
            alert_type: 'AWAITING_CHECK_ISSUANCE',
            days_aged: ageCheck,
            amount: rel,
            reference_date: s.date_credited
          });
        }
      }
    }

    if (s.is_advanced && !isCredited) {
      sssKpis.advancedExposureCount++;
      sssKpis.advancedExposureAmount = round2_(sssKpis.advancedExposureAmount + chk);
    }
    if (s.workflow_stage === 'VARIANCE_FLAGGED') sssKpis.varianceCount++;
    if (s.workflow_stage === 'COMPLETED') sssKpis.completedCount++;

    addToBucket_(clientBuckets, s.client_project, rel);
    addToBucket_(bankBuckets, s.bank_status || 'PENDING', cred || rel);
    addToBucket_(benefitBuckets, s.benefit_type || 'SB', rel);
    if (s.filing_date && s.filing_date.length >= 7) {
      addToBucket_(monthBuckets, s.filing_date.slice(0, 7), rel);
    }
  }

  for (var j = 0; j < insRows.length; j++) {
    var ir = insRows[j];
    if (toBool_(ir.is_deleted)) continue;
    var ins = sanitizeInsuranceRow_(ir);
    if (fYear && String(ins.year) !== fYear) continue;
    if (fClient && normalizeClient_(ins.client_assigned) !== fClient) continue;

    var insRel = Number(ins.amount_released) || 0;
    var insReimb = ins.amount_reimbursed === '' ? 0 : (Number(ins.amount_reimbursed) || 0);
    var insCred = ins.amount_credited === '' ? 0 : (Number(ins.amount_credited) || 0);
    var bal = ins.balance_variance === '' ? 0 : Number(ins.balance_variance);

    insKpis.totalClaims++;
    insKpis.totalReleasedAmount = round2_(insKpis.totalReleasedAmount + insRel);
    insKpis.totalReimbursedAmount = round2_(insKpis.totalReimbursedAmount + insReimb);
    insKpis.totalCreditedAmount = round2_(insKpis.totalCreditedAmount + insCred);

    if (ins.expense_bearer === 'COMPANY EXPENSE') insKpis.companyExpenseCount++;
    else insKpis.employeeExpenseCount++;

    var insBankDone = Boolean(ins.date_credited) || (ins.bank_status !== 'PENDING');
    if (!insBankDone) {
      insKpis.pendingReimbursementCount++;
      insKpis.pendingReimbursementAmount = round2_(insKpis.pendingReimbursementAmount + insRel);
      var subDate = ins.date_of_submission || ins.date_of_accident;
      var ageIns = daysBetweenYmd_(subDate, today);
      if (ageIns > bankThreshold) {
        agingAlerts.push({
          module: 'INSURANCE',
          id: ins.id,
          employee_name: ins.employee_name,
          client: ins.client_assigned,
          ref_no: ins.insurance_ref_no || ('SEQ #' + ins.seq_no),
          alert_type: 'AWAITING_INSURANCE_CREDIT',
          days_aged: ageIns,
          amount: insRel,
          reference_date: subDate
        });
      }
    }

    if (Math.abs(bal) > 0.009) {
      insKpis.disallowedBalanceCount++;
      insKpis.disallowedBalanceAmount = round2_(insKpis.disallowedBalanceAmount + bal);
    }
    if (ins.workflow_stage === 'DONE') insKpis.doneCount++;

    addToBucket_(clientBuckets, ins.client_assigned, insRel);
    addToBucket_(benefitBuckets, 'INSURANCE', insRel);
  }

  agingAlerts.sort(function(a, b) {
    return b.days_aged - a.days_aged;
  });

  return {
    sss: sssKpis,
    insurance: insKpis,
    agingAlerts: agingAlerts.slice(0, 250),
    totalAgingAlertsCount: agingAlerts.length,
    breakdowns: {
      byClient: mapToSortedList_(clientBuckets, true),
      byBank: mapToSortedList_(bankBuckets, true),
      byBenefit: mapToSortedList_(benefitBuckets, true),
      byMonth: mapToSortedList_(monthBuckets, false)
    }
  };
}

/**
 * Cross-module employee history lookup across DB_SSS_Claims and DB_Insurance_Claims.
 */
function getEmployeeHistory_(session, query) {
  ensureDatabaseReady_();
  var q = String(query || '').trim().toLowerCase();
  if (!q) return { employees: [], totalMatches: 0 };

  var sssRows = readSheetObjects_(APP_CONFIG.SHEETS.SSS);
  var insRows = readSheetObjects_(APP_CONFIG.SHEETS.INSURANCE);
  var byEmp = {};

  function getOrCreateGroup(name, ssNo) {
    var key = normalizeEmployeeKey_(name);
    if (!byEmp[key]) {
      byEmp[key] = {
        employee_key: key,
        display_name: name,
        ss_number: ssNo || '',
        clients: {},
        sss_claims: [],
        insurance_claims: [],
        totals: {
          sss_count: 0,
          sss_approved: 0,
          sss_credited: 0,
          sss_checked: 0,
          insurance_count: 0,
          insurance_released: 0,
          insurance_reimbursed: 0
        }
      };
    }
    if (ssNo && !byEmp[key].ss_number) byEmp[key].ss_number = ssNo;
    return byEmp[key];
  }

  for (var i = 0; i < sssRows.length; i++) {
    var sr = sssRows[i];
    if (toBool_(sr.is_deleted)) continue;
    var s = sanitizeSssRow_(sr);
    var hayS = (s.employee_name + ' ' + s.ss_number + ' ' + s.claim_ref_no).toLowerCase();
    if (hayS.indexOf(q) === -1) continue;

    var grp = getOrCreateGroup(s.employee_name, s.ss_number);
    grp.clients[s.client_project] = true;
    grp.sss_claims.push(s);
    grp.totals.sss_count++;
    grp.totals.sss_approved = round2_(grp.totals.sss_approved + (Number(s.amount_to_release) || 0));
    grp.totals.sss_credited = round2_(grp.totals.sss_credited + (Number(s.amount_credited) || 0));
    grp.totals.sss_checked = round2_(grp.totals.sss_checked + (Number(s.check_amount) || 0));
  }

  for (var j = 0; j < insRows.length; j++) {
    var ir = insRows[j];
    if (toBool_(ir.is_deleted)) continue;
    var ins = sanitizeInsuranceRow_(ir);
    var hayI = (ins.employee_name + ' ' + ins.insurance_ref_no).toLowerCase();
    if (hayI.indexOf(q) === -1) continue;

    var grpI = getOrCreateGroup(ins.employee_name, '');
    grpI.clients[ins.client_assigned] = true;
    grpI.insurance_claims.push(ins);
    grpI.totals.insurance_count++;
    grpI.totals.insurance_released = round2_(grpI.totals.insurance_released + (Number(ins.amount_released) || 0));
    grpI.totals.insurance_reimbursed = round2_(grpI.totals.insurance_reimbursed + (Number(ins.amount_reimbursed) || 0));
  }

  var list = [];
  var keys = Object.keys(byEmp);
  for (var k = 0; k < keys.length; k++) {
    var item = byEmp[keys[k]];
    item.clients = Object.keys(item.clients);
    list.push(item);
  }
  list.sort(function(a, b) {
    return a.display_name.localeCompare(b.display_name);
  });

  return { employees: list, totalMatches: list.length };
}

function getMasterLists_(session) {
  ensureDatabaseReady_();
  var rows = readSheetObjects_(APP_CONFIG.SHEETS.MASTERS);
  var items = [];
  var grouped = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var clean = {
      id: String(r.id || ''),
      category: String(r.category || ''),
      code: String(r.code || ''),
      label: String(r.label || ''),
      is_active: toBool_(r.is_active),
      updated_at: String(r.updated_at || '')
    };
    items.push(clean);
    if (clean.is_active) {
      if (!grouped[clean.category]) grouped[clean.category] = [];
      grouped[clean.category].push(clean);
    }
  }
  return { items: items, grouped: grouped };
}

function saveMasterListItem_(session, payload) {
  if (session.role !== APP_CONFIG.ROLES.ADMIN) {
    throw new Error('Only System Admin can manage master lists.');
  }
  var category = String(payload.category || '').trim().toUpperCase();
  var code = String(payload.code || '').trim().toUpperCase();
  var label = String(payload.label || '').trim();
  var isActive = payload.is_active === undefined ? true : toBool_(payload.is_active);
  if (!category || !code || !label) throw new Error('Category, Code, and Label are required.');

  return withScriptLock_(function() {
    var rows = readSheetObjects_(APP_CONFIG.SHEETS.MASTERS, true);
    var now = nowManilaIso_();
    var existing = null;
    if (payload.id) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === payload.id) {
          existing = rows[i];
          break;
        }
      }
      if (!existing) throw new Error('Master item not found.');
      var updated = {
        id: existing.id,
        category: category,
        code: code,
        label: label,
        is_active: isActive,
        updated_at: now
      };
      updateRowObject_(APP_CONFIG.SHEETS.MASTERS, existing._rowIndex, updated);
      writeAuditLog_(session, 'MASTERS', existing.id, 'UPDATE', { label: label, is_active: isActive }, 'Updated master item ' + category + ':' + label);
      return updated;
    }

    var maxNum = 0;
    for (var j = 0; j < rows.length; j++) {
      var m = /^MST-(\d+)$/.exec(String(rows[j].id || ''));
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    var created = {
      id: 'MST-' + String(maxNum + 1).padStart(4, '0'),
      category: category,
      code: code,
      label: label,
      is_active: isActive,
      updated_at: now
    };
    appendRowObject_(APP_CONFIG.SHEETS.MASTERS, created);
    writeAuditLog_(session, 'MASTERS', created.id, 'CREATE', { category: category, label: label }, 'Created master item ' + category + ':' + label);
    return created;
  });
}

function listAuditLogs_(session, filters) {
  ensureDatabaseReady_();
  filters = filters || {};
  var rows = readSheetObjects_(APP_CONFIG.SHEETS.AUDIT);
  var fMod = filters.module ? String(filters.module).trim().toUpperCase() : '';
  var fActor = filters.actor ? String(filters.actor).trim().toLowerCase() : '';
  var q = filters.search ? String(filters.search).trim().toLowerCase() : '';
  var maxScan = 2000;

  var out = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    if (fMod && String(r.module || '').toUpperCase() !== fMod) continue;
    if (fActor && String(r.actor_username || '').toLowerCase() !== fActor) continue;
    if (q) {
      var hay = [r.actor_username, r.module, r.record_id, r.action, r.summary, r.changed_fields_json].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }
    out.push({
      log_id: String(r.log_id || ''),
      timestamp: String(r.timestamp || ''),
      actor_username: String(r.actor_username || ''),
      actor_role: String(r.actor_role || ''),
      module: String(r.module || ''),
      record_id: String(r.record_id || ''),
      action: String(r.action || ''),
      changed_fields_json: String(r.changed_fields_json || '{}'),
      summary: String(r.summary || '')
    });
    if (out.length >= maxScan) break;
  }
  var paged = paginateArray_(out, filters.page, filters.pageSize || 25, toBool_(filters.all));
  return { items: paged.items, pagination: paged.pagination };
}

function listRawSheetNames_(session) {
  var ss = getSpreadsheet_();
  var sheets = ss.getSheets();
  var names = [];
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf('DB_') !== 0) names.push(n);
  }
  return names;
}
