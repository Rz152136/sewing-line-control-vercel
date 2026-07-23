const { getServiceClient } = require('./supabaseClient');

// Verifikasi token JWT dari header Authorization: Bearer <token>, lalu ambil
// role user dari tabel profiles. Melempar Error dengan properti .status
// (401/403) kalau tidak valid / tidak punya akses.
async function requireUser(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    const err = new Error('Belum login.');
    err.status = 401;
    throw err;
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data || !data.user) {
    const err = new Error('Sesi tidak valid, silakan login ulang.');
    err.status = 401;
    throw err;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name, email, line')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    const err = new Error('Profil user tidak ditemukan. Hubungi admin (IE) untuk dibuatkan akses.');
    err.status = 403;
    throw err;
  }

  return {
    id: data.user.id,
    email: data.user.email,
    fullName: profile.full_name,
    role: profile.role,
    line: profile.line || null,
  };
}

function requireRole(user, allowedRoles) {
  if (!allowedRoles.includes(user.role)) {
    const err = new Error('Anda tidak punya akses untuk aksi ini.');
    err.status = 403;
    throw err;
  }
}

// Supervisor hanya boleh baca/tulis data line miliknya sendiri. IE bebas semua line.
function requireLineAccess(user, line) {
  if (user.role === 'ie') return;
  if (user.role === 'supervisor' && user.line && user.line === line) return;
  const err = new Error('Anda tidak punya akses ke line ini.');
  err.status = 403;
  throw err;
}

module.exports = { requireUser, requireRole, requireLineAccess };
