/**
 * BUYE IELTS — Backend (Google Apps Script + Google Sheets as DB)
 * ------------------------------------------------------------
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1u-WVtpNtIXuNGxbHYUTQiRazo7tZraeOF8_WPqmQg-I/edit
 *
 * SETUP (one-time):
 *   1. Open the spreadsheet above → Extensions → Apps Script.
 *   2. Delete any starter code, paste this whole file in as Code.gs.
 *   3. Run the function `setupDatabase` once from the Apps Script editor
 *      (Run ▶ with "setupDatabase" selected). Approve the permissions prompt.
 *      This creates every sheet/tab listed below with headers. Safe to re-run —
 *      it will not wipe existing rows.
 *   4. Run `createFirstAdmin` once (edit the email/password inside it first)
 *      to create your own admin login.
 *   5. Deploy → New deployment → type "Web app" →
 *        Execute as: Me
 *        Who has access: Anyone
 *      Copy the Web App URL — that's the single endpoint the website calls
 *      for everything (register, login, tests, results, admin).
 *
 * All requests go to that one URL:
 *   GET  ?action=getTests
 *   GET  ?action=getQuestions&testId=...
 *   GET  ?action=getDashboard&token=...
 *   POST { action: "register", ... }   (see handlers below for each action's fields)
 *
 * IMPORTANT — CORS: send POST requests with
 *   fetch(URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({...}) })
 * Using 'text/plain' (not 'application/json') avoids the browser's CORS
 * preflight request, which Apps Script Web Apps cannot answer. The body is
 * still parsed as JSON server-side below.
 */

// ============ CONFIG ============
const SHEET_ID = '1u-WVtpNtIXuNGxbHYUTQiRazo7tZraeOF8_WPqmQg-I';
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const SCHEMAS = {
  Users:      ['UserID','Name','Email','Phone','PasswordHash','Salt','Role','CreatedAt','LastLogin'],
  Sessions:   ['Token','UserID','CreatedAt','ExpiresAt'],
  Tests:      ['TestID','Title','ExamType','Module','DurationMinutes','CreatedAt'],
  Questions:  ['QuestionID','TestID','Module','QuestionType','Prompt','OptionA','OptionB','OptionC','OptionD','CorrectAnswer','Marks','PassageOrAudioURL'],
  Attempts:   ['AttemptID','UserID','TestID','StartedAt','SubmittedAt','Status'],
  Responses:  ['ResponseID','AttemptID','QuestionID','AnswerGiven','IsCorrect','MarksAwarded'],
  Results:    ['ResultID','AttemptID','UserID','TestID','Module','RawScore','MaxScore','BandScore','CompletedAt']
};

// ============ SETUP ============
function setupDatabase() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  Object.keys(SCHEMAS).forEach(function(name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    const headers = SCHEMAS[name];
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const hasHeaders = headers.every(function(h, i) { return firstRow[i] === h; });
    if (!hasHeaders) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
  return 'Database structure ready.';
}

// Run once, after editing the email/password below.
function createFirstAdmin() {
  const result = registerUser({
    name: 'Admin',
    email: 'admin@buye.online',   // <-- change this
    phone: '',
    password: 'ChangeThisPassword123'  // <-- change this
  }, 'admin');
  Logger.log(result);
}

// ============ ENTRY POINTS ============
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case 'ping':          result = { ok: true, time: new Date() }; break;
      case 'getTests':      result = getTests(); break;
      case 'getQuestions':  result = getQuestions(e.parameter.testId); break;
      case 'getDashboard':  result = getStudentDashboard(requireSession(e.parameter.token)); break;
      case 'adminOverview': result = getAdminOverview(requireAdmin(e.parameter.token)); break;
      case 'adminUsers':    result = getAllUsers(requireAdmin(e.parameter.token)); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return jsonOutput({ success: true, data: result });
  } catch (err) {
    return jsonOutput({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;
    switch (action) {
      case 'register':        result = registerUser(body, 'student'); break;
      case 'login':            result = loginUser(body.email, body.password); break;
      case 'startAttempt':     result = startAttempt(requireSession(body.token), body.testId); break;
      case 'submitTest':       result = submitTest(requireSession(body.token), body.attemptId, body.testId, body.answers); break;
      case 'adminAddTest':     result = adminAddTest(requireAdmin(body.token), body); break;
      case 'adminAddQuestion': result = adminAddQuestion(requireAdmin(body.token), body); break;
      case 'adminDeleteQuestion': result = adminDeleteQuestion(requireAdmin(body.token), body.questionId); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return jsonOutput({ success: true, data: result });
  } catch (err) {
    return jsonOutput({ success: false, error: err.message });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ SHEET HELPERS ============
function sheet_(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

function readAll_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values.map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function appendRow_(name, obj) {
  const sh = sheet_(name);
  const headers = SCHEMAS[name];
  const row = headers.map(function(h) { return (obj[h] !== undefined) ? obj[h] : ''; });
  sh.appendRow(row);
  return obj;
}

function findRow_(name, matchKey, matchValue) {
  const rows = readAll_(name);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][matchKey] === matchValue) return rows[i];
  }
  return null;
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid().slice(0, 8);
}

// ============ AUTH ============
function hashPassword_(password, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
  return digest.map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}

function registerUser(body, role) {
  if (!body.email || !body.password || !body.name) throw new Error('Name, email and password are required.');
  const existing = findRow_('Users', 'Email', body.email.toLowerCase().trim());
  if (existing) throw new Error('An account with this email already exists.');

  const salt = Utilities.getUuid();
  const userId = newId_('U');
  appendRow_('Users', {
    UserID: userId,
    Name: body.name,
    Email: body.email.toLowerCase().trim(),
    Phone: body.phone || '',
    PasswordHash: hashPassword_(body.password, salt),
    Salt: salt,
    Role: role || 'student',
    CreatedAt: new Date(),
    LastLogin: ''
  });
  const session = createSession_(userId);
  return { userId: userId, token: session.Token, role: role || 'student', name: body.name };
}

function loginUser(email, password) {
  if (!email || !password) throw new Error('Email and password are required.');
  const user = findRow_('Users', 'Email', email.toLowerCase().trim());
  if (!user) throw new Error('No account found with that email.');
  const hash = hashPassword_(password, user.Salt);
  if (hash !== user.PasswordHash) throw new Error('Incorrect password.');

  updateCell_('Users', 'UserID', user.UserID, 'LastLogin', new Date());
  const session = createSession_(user.UserID);
  return { userId: user.UserID, token: session.Token, role: user.Role, name: user.Name };
}

function createSession_(userId) {
  const token = Utilities.getUuid();
  const session = {
    Token: token,
    UserID: userId,
    CreatedAt: new Date(),
    ExpiresAt: new Date(Date.now() + SESSION_LIFETIME_MS)
  };
  appendRow_('Sessions', session);
  return session;
}

function requireSession(token) {
  if (!token) throw new Error('Not logged in.');
  const session = findRow_('Sessions', 'Token', token);
  if (!session) throw new Error('Session not found. Please log in again.');
  if (new Date(session.ExpiresAt).getTime() < Date.now()) throw new Error('Session expired. Please log in again.');
  const user = findRow_('Users', 'UserID', session.UserID);
  if (!user) throw new Error('User not found.');
  return user;
}

function requireAdmin(token) {
  const user = requireSession(token);
  if (user.Role !== 'admin') throw new Error('Admin access required.');
  return user;
}

function updateCell_(sheetName, matchKey, matchValue, columnName, newValue) {
  const sh = sheet_(sheetName);
  const headers = SCHEMAS[sheetName];
  const colIndex = headers.indexOf(matchKey) + 1;
  const targetColIndex = headers.indexOf(columnName) + 1;
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][colIndex - 1] === matchValue) {
      sh.getRange(r + 1, targetColIndex).setValue(newValue);
      return true;
    }
  }
  return false;
}

// ============ TESTS & QUESTIONS ============
function getTests() {
  return readAll_('Tests');
}

function getQuestions(testId) {
  if (!testId) throw new Error('testId is required.');
  // Never send CorrectAnswer to the client before submission.
  return readAll_('Questions')
    .filter(function(q) { return q.TestID === testId; })
    .map(function(q) {
      return {
        QuestionID: q.QuestionID, TestID: q.TestID, Module: q.Module,
        QuestionType: q.QuestionType, Prompt: q.Prompt,
        OptionA: q.OptionA, OptionB: q.OptionB, OptionC: q.OptionC, OptionD: q.OptionD,
        Marks: q.Marks, PassageOrAudioURL: q.PassageOrAudioURL
      };
    });
}

function startAttempt(user, testId) {
  const attemptId = newId_('A');
  appendRow_('Attempts', {
    AttemptID: attemptId, UserID: user.UserID, TestID: testId,
    StartedAt: new Date(), SubmittedAt: '', Status: 'in_progress'
  });
  return { attemptId: attemptId };
}

// answers: [{ questionId, answer }]
function submitTest(user, attemptId, testId, answers) {
  if (!answers || !answers.length) throw new Error('No answers submitted.');
  const questions = readAll_('Questions').filter(function(q) { return q.TestID === testId; });
  const byModule = {};
  let rawTotal = 0, maxTotal = 0;

  answers.forEach(function(a) {
    const q = questions.filter(function(x) { return x.QuestionID === a.questionId; })[0];
    if (!q) return;
    const isCorrect = String(q.CorrectAnswer).trim().toLowerCase() === String(a.answer).trim().toLowerCase();
    const marks = isCorrect ? Number(q.Marks || 1) : 0;

    appendRow_('Responses', {
      ResponseID: newId_('R'), AttemptID: attemptId, QuestionID: q.QuestionID,
      AnswerGiven: a.answer, IsCorrect: isCorrect, MarksAwarded: marks
    });

    byModule[q.Module] = byModule[q.Module] || { raw: 0, max: 0 };
    byModule[q.Module].raw += marks;
    byModule[q.Module].max += Number(q.Marks || 1);
    rawTotal += marks;
    maxTotal += Number(q.Marks || 1);
  });

  const results = Object.keys(byModule).map(function(module) {
    const m = byModule[module];
    const band = scoreToBand_(m.raw, m.max);
    appendRow_('Results', {
      ResultID: newId_('RES'), AttemptID: attemptId, UserID: user.UserID, TestID: testId,
      Module: module, RawScore: m.raw, MaxScore: m.max, BandScore: band, CompletedAt: new Date()
    });
    return { module: module, raw: m.raw, max: m.max, band: band };
  });

  updateCell_('Attempts', 'AttemptID', attemptId, 'SubmittedAt', new Date());
  updateCell_('Attempts', 'AttemptID', attemptId, 'Status', 'completed');

  return { overallBand: scoreToBand_(rawTotal, maxTotal), moduleResults: results };
}

// Rough %-correct → IELTS-style band mapping. Tune freely — this is a
// practice-test estimate, not an official conversion table.
function scoreToBand_(raw, max) {
  if (!max) return 0;
  const pct = raw / max;
  const table = [
    [0.95, 9], [0.88, 8.5], [0.80, 8], [0.72, 7.5], [0.64, 7],
    [0.56, 6.5], [0.48, 6], [0.40, 5.5], [0.32, 5], [0.24, 4.5], [0, 4]
  ];
  for (let i = 0; i < table.length; i++) {
    if (pct >= table[i][0]) return table[i][1];
  }
  return 4;
}

// ============ STUDENT DASHBOARD ============
function getStudentDashboard(user) {
  const results = readAll_('Results').filter(function(r) { return r.UserID === user.UserID; });
  const attempts = readAll_('Attempts').filter(function(a) { return a.UserID === user.UserID; });

  const byModule = {};
  results.forEach(function(r) {
    byModule[r.Module] = byModule[r.Module] || [];
    byModule[r.Module].push({ band: r.BandScore, date: r.CompletedAt });
  });
  const moduleAverages = Object.keys(byModule).map(function(module) {
    const scores = byModule[module].map(function(x) { return x.band; });
    const avg = scores.reduce(function(a, b) { return a + b; }, 0) / scores.length;
    return { module: module, average: Math.round(avg * 10) / 10, attempts: scores.length, history: byModule[module] };
  });

  return {
    name: user.Name,
    totalAttempts: attempts.length,
    completedAttempts: attempts.filter(function(a) { return a.Status === 'completed'; }).length,
    moduleAverages: moduleAverages,
    recentResults: results.slice(-10).reverse()
  };
}

// ============ ADMIN ============
function adminAddTest(admin, body) {
  const testId = newId_('T');
  appendRow_('Tests', {
    TestID: testId, Title: body.title, ExamType: body.examType,
    Module: body.module, DurationMinutes: body.durationMinutes, CreatedAt: new Date()
  });
  return { testId: testId };
}

function adminAddQuestion(admin, body) {
  const questionId = newId_('Q');
  appendRow_('Questions', {
    QuestionID: questionId, TestID: body.testId, Module: body.module,
    QuestionType: body.questionType, Prompt: body.prompt,
    OptionA: body.optionA || '', OptionB: body.optionB || '',
    OptionC: body.optionC || '', OptionD: body.optionD || '',
    CorrectAnswer: body.correctAnswer, Marks: body.marks || 1,
    PassageOrAudioURL: body.passageOrAudioUrl || ''
  });
  return { questionId: questionId };
}

function adminDeleteQuestion(admin, questionId) {
  const sh = sheet_('Questions');
  const values = sh.getDataRange().getValues();
  const idCol = SCHEMAS.Questions.indexOf('QuestionID');
  for (let r = values.length - 1; r >= 1; r--) {
    if (values[r][idCol] === questionId) { sh.deleteRow(r + 1); return { deleted: true }; }
  }
  return { deleted: false };
}

function getAllUsers(admin) {
  return readAll_('Users').map(function(u) {
    return { UserID: u.UserID, Name: u.Name, Email: u.Email, Role: u.Role, CreatedAt: u.CreatedAt, LastLogin: u.LastLogin };
  });
}

function getAdminOverview(admin) {
  const results = readAll_('Results');
  const users = readAll_('Users').filter(function(u) { return u.Role === 'student'; });
  const byModule = {};
  results.forEach(function(r) {
    byModule[r.Module] = byModule[r.Module] || [];
    byModule[r.Module].push(r.BandScore);
  });
  const moduleAverages = Object.keys(byModule).map(function(module) {
    const scores = byModule[module];
    const avg = scores.reduce(function(a, b) { return a + b; }, 0) / scores.length;
    return { module: module, average: Math.round(avg * 10) / 10, totalAttempts: scores.length };
  });

  return {
    totalStudents: users.length,
    totalAttempts: readAll_('Attempts').length,
    totalTests: readAll_('Tests').length,
    moduleAverages: moduleAverages
  };
}
