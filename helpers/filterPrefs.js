// /helpers/filterPrefs.js
export const loadUserFilterPrefs = (email) => {
  try { return JSON.parse(localStorage.getItem(`prefs:${email}`) || '{}'); }
  catch { return {}; }
};

export const saveUserFilterPrefs = (email, prefs) => {
  try {
    localStorage.setItem(`prefs:${email}`, JSON.stringify(prefs || {}));
  } catch {}
};

// devuelve owner por defecto: prefs > partner_tag > 'all'
export const resolveDefaultOwner = (me, prefs, pageKey) => {
  const p1 = prefs?.[pageKey]?.owner;
  if (p1) return p1;
  const tag = (me?.partner_tag || '').trim().toLowerCase();
  if (tag === 'cecil' || tag === 'rucapellan') return tag; // normaliza
  return 'all';
};
