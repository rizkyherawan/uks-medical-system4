// ============================================================
// EMOJI KATEGORI TEKANAN DARAH
// Enam wajah SVG buatan sendiri, warnanya mengikuti palet kategori di website:
//   hipotensi     : sedih, ada awan hujan dan air mata
//   normal        : bahagia, topi pesta dan konfeti berjatuhan
//   prehipertensi : mulai cemas, keringat dingin
//   hipertensi1   : khawatir, gigi menggertak, jantung berdebar
//   hipertensi2   : panik berteriak, keringat berhamburan
//   krisis        : sangat panik, sirene darurat menyala dan uap dari telinga
// Animasinya ada di css/emoji.css (otomatis berhenti bila perangkat meminta gerak dikurangi).
//
// Pemakaian: element.innerHTML = BPEmoji.svg('normal', { size: 96 });
// ============================================================
const BPEmoji = (() => {
  'use strict';

  const LABEL = {
    hipotensi: 'Wajah sedih dengan awan hujan',
    normal: 'Wajah bahagia dengan topi pesta dan konfeti',
    prehipertensi: 'Wajah mulai cemas dengan keringat dingin',
    hipertensi1: 'Wajah khawatir dengan jantung berdebar',
    hipertensi2: 'Wajah panik berteriak',
    krisis: 'Wajah sangat panik dengan sirene darurat'
  };

  // Bentuk dasar kepala: lingkaran + kilau
  const head = (cls = '') =>
    `<g class="emo-head ${cls}">
       <circle class="emo-face" cx="60" cy="66" r="40"/>
       <ellipse cx="45" cy="45" rx="14" ry="7" fill="#fff" opacity=".3" transform="rotate(-28 45 45)"/>`;

  const drop = (x, y, cls) =>
    `<path class="emo-drop ${cls}" d="M${x} ${y} q-5 9 0 13 q5 -4 0 -13z"/>`;

  const bang = (x, y, cls = '') =>
    `<g class="emo-bang ${cls}"><rect class="emo-ink" x="${x}" y="${y}" width="5" height="14" rx="2.5"/><circle class="emo-ink" cx="${x + 2.5}" cy="${y + 20}" r="3"/></g>`;

  const faces = {
    // ---------- Sedih ----------
    hipotensi: () => `
      <g class="emo-cloud">
        <circle cx="46" cy="13" r="8"/><circle cx="60" cy="9" r="10"/>
        <circle cx="74" cy="13" r="8"/><rect x="42" y="12" width="36" height="9" rx="4.5"/>
        <path class="emo-rain r1" d="M50 24 v7"/><path class="emo-rain r2" d="M60 24 v7"/><path class="emo-rain r3" d="M70 24 v7"/>
      </g>
      ${head('emo-sink')}
        <path class="emo-line" d="M36 55 L54 49"/><path class="emo-line" d="M66 49 L84 55"/>
        <ellipse class="emo-eye" cx="45" cy="66" rx="7.5" ry="8"/><ellipse class="emo-eye" cx="75" cy="66" rx="7.5" ry="8"/>
        <circle class="emo-ink" cx="45" cy="69" r="3.6"/><circle class="emo-ink" cx="75" cy="69" r="3.6"/>
        <path class="emo-face emo-lid" d="M37 66 a8 8 0 0 1 16 0z"/><path class="emo-face emo-lid" d="M67 66 a8 8 0 0 1 16 0z"/>
        <path class="emo-line" d="M45 92 q15 -13 30 0"/>
        <path class="emo-tear" d="M38 77 q-5 9 0 13 q5 -4 0 -13z"/>
        <path class="emo-tear t2" d="M82 77 q-5 9 0 13 q5 -4 0 -13z"/>
      </g>`,

    // ---------- Bahagia + pesta ----------
    normal: () => `
      <g class="emo-confetti">
        <rect class="c c1" x="14" y="0" width="6" height="9" rx="1.5" fill="#E8434D"/>
        <rect class="c c2" x="34" y="0" width="7" height="5" rx="1.5" fill="#FFD84D"/>
        <circle class="c c3" cx="50" cy="3" r="3.5" fill="#4C8DF0"/>
        <rect class="c c4" x="76" y="0" width="6" height="9" rx="1.5" fill="#2E9E63"/>
        <circle class="c c5" cx="92" cy="3" r="3.5" fill="#FF8FA3"/>
        <rect class="c c6" x="104" y="0" width="7" height="5" rx="1.5" fill="#E8434D"/>
        <path class="c c7" d="M24 0 l4 8 h-8z" fill="#4C8DF0"/>
        <circle class="c c8" cx="64" cy="3" r="3" fill="#FFD84D"/>
        <rect class="c c9" x="6" y="0" width="5" height="8" rx="1.5" fill="#2E9E63"/>
        <path class="c c10" d="M98 0 l4 8 h-8z" fill="#FFD84D"/>
      </g>
      ${head('emo-bounce')}
        <g transform="rotate(-14 60 34)">
          <path d="M60 2 L43 36 L77 36 Z" fill="#E8434D" stroke="#B4131F" stroke-width="2" stroke-linejoin="round"/>
          <path d="M52 20 L68 20 M48 28 L72 28" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
          <circle cx="60" cy="3" r="4.5" fill="#FFD84D" stroke="#D9A400" stroke-width="1.5"/>
        </g>
        <path class="emo-line" d="M36 66 q8 -11 16 0"/><path class="emo-line" d="M68 66 q8 -11 16 0"/>
        <ellipse cx="33" cy="80" rx="6.5" ry="4.2" fill="#FF8FA3" opacity=".65"/><ellipse cx="87" cy="80" rx="6.5" ry="4.2" fill="#FF8FA3" opacity=".65"/>
        <path d="M42 80 q18 24 36 0 z" fill="#7A1F2B" stroke="#7A1F2B" stroke-width="2" stroke-linejoin="round"/>
        <path d="M51 91 q9 -7 18 0 q-9 7 -18 0z" fill="#FF8FA3"/>
      </g>
      <path class="emo-spark s1" d="M14 44 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#FFD84D"/>
      <path class="emo-spark s2" d="M104 66 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#fff"/>`,

    // ---------- Mulai cemas ----------
    prehipertensi: () => `
      ${bang(100, 10, 'b1')}
      ${head('emo-wobble')}
        <path class="emo-line" d="M36 52 q8 -5 17 -1"/><path class="emo-line" d="M67 46 q8 -8 17 0"/>
        <circle class="emo-eye" cx="45" cy="65" r="8.5"/><circle class="emo-eye" cx="75" cy="65" r="8.5"/>
        <circle class="emo-ink look" cx="48" cy="66" r="3.4"/><circle class="emo-ink look" cx="78" cy="66" r="3.4"/>
        <path class="emo-line" d="M44 90 q4.5 -5 9 0 t9 0 t9 0 t9 0"/>
        ${drop(95, 52, 'd1')}
      </g>`,

    // ---------- Khawatir ----------
    hipertensi1: () => `
      <circle class="emo-pulse" cx="60" cy="66" r="42"/>
      ${head('emo-tremble')}
        <path class="emo-line" d="M35 56 L54 47"/><path class="emo-line" d="M66 47 L85 56"/>
        <circle class="emo-eye" cx="45" cy="66" r="9"/><circle class="emo-eye" cx="75" cy="66" r="9"/>
        <circle class="emo-ink look" cx="45" cy="66" r="3"/><circle class="emo-ink look" cx="75" cy="66" r="3"/>
        <rect x="42" y="84" width="36" height="14" rx="6" fill="#fff" stroke="var(--emo-ink)" stroke-width="3"/>
        <path d="M51 84 v14 M60 84 v14 M69 84 v14" stroke="var(--emo-ink)" stroke-width="2"/>
        ${drop(26, 52, 'd1')}${drop(94, 46, 'd2')}
      </g>`,

    // ---------- Panik ----------
    hipertensi2: () => `
      <g class="emo-shock"><path d="M44 22 L40 8"/><path d="M60 20 L60 4"/><path d="M76 22 L80 8"/></g>
      ${bang(4, 28, 'b1')}${bang(111, 28, 'b2')}
      ${head('emo-shake')}
        <path class="emo-line" d="M33 48 L53 38"/><path class="emo-line" d="M67 38 L87 48"/>
        <circle class="emo-eye" cx="45" cy="63" r="11"/><circle class="emo-eye" cx="75" cy="63" r="11"/>
        <circle class="emo-ink look" cx="45" cy="63" r="2.8"/><circle class="emo-ink look" cx="75" cy="63" r="2.8"/>
        <ellipse cx="32" cy="82" rx="6.5" ry="4" fill="#C62828" opacity=".35"/><ellipse cx="88" cy="82" rx="6.5" ry="4" fill="#C62828" opacity=".35"/>
        <ellipse cx="60" cy="90" rx="12" ry="14" fill="#6B1A22"/>
        <path d="M51 98 q9 -9 18 0 q-3 6 -9 6 q-6 0 -9 -6z" fill="#FF8FA3"/>
        ${drop(22, 40, 'd1')}${drop(98, 38, 'd2')}${drop(104, 60, 'd3')}
      </g>`,

    // ---------- Sangat panik: darurat ----------
    krisis: () => `
      <g class="emo-rays"><path d="M60 -2 V-2"/><path d="M36 6 L30 0"/><path d="M84 6 L90 0"/><path d="M26 16 L18 12"/><path d="M94 16 L102 12"/></g>
      <rect x="44" y="17" width="32" height="7" rx="2" fill="#4B5563"/>
      <path class="emo-siren" d="M48 17 a12 12 0 0 1 24 0z"/>
      <circle class="emo-steam s1" cx="14" cy="62" r="7"/><circle class="emo-steam s2" cx="106" cy="62" r="7"/>
      <circle class="emo-steam s3" cx="10" cy="74" r="5"/><circle class="emo-steam s4" cx="110" cy="74" r="5"/>
      ${head('emo-quake')}
        <path class="emo-line" d="M32 50 L53 40"/><path class="emo-line" d="M67 40 L88 50"/>
        <circle class="emo-eye" cx="45" cy="64" r="12.5"/><circle class="emo-eye" cx="75" cy="64" r="12.5"/>
        <path d="M36 58 l4 3 M54 58 l-4 3 M66 58 l4 3 M84 58 l-4 3" stroke="#E4252F" stroke-width="1.6" stroke-linecap="round"/>
        <circle class="emo-ink look" cx="45" cy="64" r="2.6"/><circle class="emo-ink look" cx="75" cy="64" r="2.6"/>
        <path d="M38 82 q22 -7 44 0 q-1 28 -22 28 q-21 0 -22 -28z" fill="#3D0B12"/>
        <path d="M50 104 q10 -10 20 0 q-4 5 -10 5 q-6 0 -10 -5z" fill="#FF8FA3"/>
        <path d="M44 82 h32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>
        ${drop(20, 44, 'd1')}${drop(100, 42, 'd2')}${drop(106, 62, 'd3')}${drop(14, 66, 'd4')}
      </g>
      ${bang(2, 26, 'b1')}${bang(113, 26, 'b2')}`
  };

  function svg(kode, { size = 96, animate = true } = {}) {
    const draw = faces[kode];
    if (!draw) return '';
    const still = animate ? '' : ' is-still';
    return `<svg class="emo emo-${kode}${still}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${LABEL[kode]}" focusable="false">${draw()}</svg>`;
  }

  return { svg, has: (kode) => Boolean(faces[kode]), label: (kode) => LABEL[kode] || '' };
})();
