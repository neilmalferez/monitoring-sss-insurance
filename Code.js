/**
 * Google Apps Script Web App entrypoint and JSON-safe API endpoints.
 */

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.initialPage = (e && e.parameter && e.parameter.page) ? String(e.parameter.page).trim().toLowerCase() : '';
  return template.evaluate()
    .setTitle(APP_CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function apiWrap_(fn) {
  try {
    var data = fn();
    return { ok: true, data: data };
  } catch (err) {
    return {
      ok: false,
      error: (err && err.message) ? err.message : String(err)
    };
  }
}

function apiLogin(username, password) {
  return apiWrap_(function() {
    return loginUser_(username, password);
  });
}

function apiLogout(token) {
  return apiWrap_(function() {
    return logoutUser_(token);
  });
}

function apiBootstrap(token) {
  return apiWrap_(function() {
    ensureDatabaseReady_();
    var sess = getSessionOrNull_(token);
    if (!sess) {
      return { authenticated: false };
    }
    var masters = getMasterLists_(sess);
    var rawSheets = [];
    try {
      rawSheets = listRawSheetNames_(sess);
    } catch (e) {
      rawSheets = [];
    }
    var profile = null;
    try {
      profile = getMyProfile_(sess);
    } catch (e) {
      profile = null;
    }
    return {
      authenticated: true,
      user: profile || {
        user_id: sess.user_id,
        username: sess.username,
        full_name: sess.full_name,
        email: '',
        role: sess.role,
        role_label: APP_CONFIG.ROLE_LABELS[sess.role] || sess.role,
        must_change_password: Boolean(sess.must_change_password),
        is_active: true,
        created_at: '',
        last_login: '',
        photo_data: ''
      },
      permissions: buildPermissionsForRole_(sess.role),
      masters: masters,
      rawSheets: rawSheets,
      config: {
        appName: APP_CONFIG.APP_NAME,
        defaultErid: APP_CONFIG.DEFAULT_ERID,
        agingThresholds: APP_CONFIG.AGING_THRESHOLDS
      }
    };
  });
}

function apiChangePassword(token, currentPassword, newPassword) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return changePassword_(sess, currentPassword, newPassword);
  });
}

function apiGetDashboard(token, filters) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return getDashboardSummary_(sess, filters);
  });
}

function apiListSss(token, filters) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return listSssClaims_(sess, filters);
  });
}

function apiGetSssById(token, id) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return getSssClaimById_(sess, id);
  });
}

function apiSaveSss(token, payload) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return saveSssClaim_(sess, payload);
  });
}

function apiDeleteSss(token, id) {
  return apiWrap_(function() {
    var sess = requireSession_(token, [APP_CONFIG.ROLES.ADMIN]);
    return deleteSssClaim_(sess, id);
  });
}

function apiGetCheckGroup(token, checkNo) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return getClaimsByCheckNo_(sess, checkNo);
  });
}

function apiListInsurance(token, filters) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return listInsuranceClaims_(sess, filters);
  });
}

function apiGetInsuranceById(token, id) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return getInsuranceClaimById_(sess, id);
  });
}

function apiSaveInsurance(token, payload) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return saveInsuranceClaim_(sess, payload);
  });
}

function apiDeleteInsurance(token, id) {
  return apiWrap_(function() {
    var sess = requireSession_(token, [APP_CONFIG.ROLES.ADMIN]);
    return deleteInsuranceClaim_(sess, id);
  });
}

function apiEmployeeHistory(token, query) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return getEmployeeHistory_(sess, query);
  });
}

function apiPreviewImport(token, opts) {
  return apiWrap_(function() {
    var sess = requireSession_(token, [APP_CONFIG.ROLES.ADMIN, APP_CONFIG.ROLES.HR]);
    return previewLegacyImport_(sess, opts);
  });
}

function apiCommitImport(token, opts) {
  return apiWrap_(function() {
    var sess = requireSession_(token, [APP_CONFIG.ROLES.ADMIN, APP_CONFIG.ROLES.HR]);
    return commitLegacyImport_(sess, opts);
  });
}

function apiExportCsv(token, opts) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return exportReportCsv_(sess, opts);
  });
}

function apiSaveMasterItem(token, payload) {
  return apiWrap_(function() {
    var sess = requireSession_(token, [APP_CONFIG.ROLES.ADMIN]);
    var saved = saveMasterListItem_(sess, payload);
    return { saved: saved, masters: getMasterLists_(sess) };
  });
}

function apiListUsers(token) {
  return apiWrap_(function() {
    var sess = requireSession_(token, [APP_CONFIG.ROLES.ADMIN]);
    return listUsers_(sess);
  });
}

function apiSaveUser(token, payload) {
  return apiWrap_(function() {
    var sess = requireSession_(token, [APP_CONFIG.ROLES.ADMIN]);
    return saveUser_(sess, payload);
  });
}

function apiListAuditLogs(token, filters) {
  return apiWrap_(function() {
    var sess = requireSession_(token);
    return listAuditLogs_(sess, filters);
  });
}
