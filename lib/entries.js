const { getServiceClient } = require('./supabaseClient');

function getSupabase() {
  return getServiceClient();
}

function genId() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const NUMERIC_REQUIRED = ['qtyOrder', 'smv', 'mp', 'wh', 'output', 'transfer'];
const NUMERIC_OPTIONAL = ['tis', 'effManual', 'defectQty'];
const TEXT_FIELDS = ['line', 'date', 'style', 'planStart', 'planFinish', 'defectName', 'notes'];

function sanitizeEntry(body) {
  const entry = {};
  entry.id = body.id && String(body.id).trim() ? String(body.id).trim() : undefined;

  TEXT_FIELDS.forEach((f) => {
    entry[f] = body[f] !== undefined && body[f] !== null ? String(body[f]).trim() : '';
  });

  NUMERIC_REQUIRED.forEach((f) => {
    const v = Number(body[f]);
    entry[f] = Number.isFinite(v) ? v : 0;
  });

  NUMERIC_OPTIONAL.forEach((f) => {
    const raw = body[f];
    if (raw === '' || raw === null || raw === undefined) entry[f] = null;
    else {
      const v = Number(raw);
      entry[f] = Number.isFinite(v) ? v : null;
    }
  });

  return entry;
}

function validateEntry(entry) {
  const errors = [];
  if (!entry.line) errors.push('Line wajib diisi.');
  if (!entry.date) errors.push('Tanggal wajib diisi.');
  if (!entry.planStart) errors.push('Plan Sewing Start wajib diisi.');
  if (!entry.planFinish) errors.push('Plan Sewing Finish wajib diisi.');
  return errors;
}

// entry (camelCase, dipakai frontend) -> row (snake_case, kolom tabel Postgres)
function entryToRow(e) {
  return {
    id: e.id,
    line: e.line,
    date: e.date,
    style: e.style,
    qty_order: e.qtyOrder,
    plan_start: e.planStart || null,
    plan_finish: e.planFinish || null,
    tis: e.tis,
    smv: e.smv,
    mp: e.mp,
    wh: e.wh,
    output: e.output,
    transfer: e.transfer,
    eff_manual: e.effManual,
    defect_name: e.defectName,
    defect_qty: e.defectQty,
    notes: e.notes,
    updated_at: e.updatedAt || new Date().toISOString(),
  };
}

// row (dari Postgres) -> entry (camelCase, format yang dipakai frontend, sama seperti sebelumnya)
function rowToEntry(r) {
  return {
    id: r.id,
    line: r.line,
    date: r.date,
    style: r.style,
    qtyOrder: r.qty_order,
    planStart: r.plan_start,
    planFinish: r.plan_finish,
    tis: r.tis,
    smv: r.smv,
    mp: r.mp,
    wh: r.wh,
    output: r.output,
    transfer: r.transfer,
    effManual: r.eff_manual,
    defectName: r.defect_name,
    defectQty: r.defect_qty,
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

module.exports = {
  getSupabase,
  genId,
  sanitizeEntry,
  validateEntry,
  entryToRow,
  rowToEntry,
};
