/**
 * Editorial 2D Cinema HUD, 3D-Projected Callouts, Diegetic Chat UI & Subtitles
 * Rendered deterministically on top of WebGL at 1920x1080.
 */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function smoothstep(a, b, x) {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

const FONT_DISPLAY = '"Avenir Next", "Helvetica Neue", -apple-system, sans-serif';
const FONT_MONO = '"SF Mono", "Menlo", "Monaco", monospace';
const FONT_SERIF = '"Baskerville", "Georgia", serif';

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderHud(ctx, W, H, t, state, timings) {
  ctx.clearRect(0, 0, W, H);

  // ==========================================================================
  // 1. DYNAMIC CINEMASCOPE <-> IMAX LETTERBOX (2.39:1 -> full 16:9 in Act V!)
  // ==========================================================================
  // 2.39:1 inside 1920x1080 => bar height = 138px top & bottom
  const openIn = smoothstep(108.4, 111.2, t);
  const closeOut = smoothstep(142.2, 144.6, t);
  const imaxAmount = openIn * (1 - closeOut);
  const barH = Math.round(132 * (1 - imaxAmount));

  // ==========================================================================
  // 2. 3D-PROJECTED DIEGETIC CALLOUTS (Acts II & III)
  // ==========================================================================
  if (state.callouts && state.callouts.length > 0) {
    ctx.save();
    for (const c of state.callouts) {
      if (!c.visible || c.alpha <= 0.02) continue;
      const sx = c.x;
      const sy = c.y;
      if (sx < 70 || sx > W - 70 || sy < barH + 35 || sy > H - barH - 95) continue;

      ctx.globalAlpha = clamp01(c.alpha);
      const accent = c.color || '#5CE8FF';

      // Target reticle dot
      ctx.beginPath();
      ctx.arc(sx, sy, c.danger ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, c.danger ? 15 : 10, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = c.danger ? 2.2 : 1.4;
      ctx.stroke();

      // Leader line
      const dx = c.offsetX ?? (sx > W * 0.55 ? -135 : 135);
      const dy = c.offsetY ?? -46;
      const lx = sx + dx * 0.45;
      const ly = sy + dy;
      const tx = sx + dx;

      ctx.beginPath();
      ctx.moveTo(sx + (dx > 0 ? 11 : -11), sy - 5);
      ctx.lineTo(lx, ly);
      ctx.lineTo(tx, ly);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pill badge
      ctx.font = `600 ${c.danger ? 20 : 17}px ${FONT_MONO}`;
      const labelW = ctx.measureText(c.label).width;
      const subW = c.sub ? (ctx.font = `400 13px ${FONT_MONO}`, ctx.measureText(c.sub).width) : 0;
      const boxW = Math.max(labelW, subW) + 28;
      const boxH = c.sub ? 52 : 34;
      const bx = Math.max(48, Math.min(W - boxW - 48, dx > 0 ? tx : tx - boxW));
      const by = Math.max(barH + 24, Math.min(H - barH - boxH - 24, ly - boxH * 0.5));

      drawRoundRect(ctx, bx, by, boxW, boxH, 6);
      ctx.fillStyle = c.danger ? 'rgba(42, 6, 12, 0.86)' : 'rgba(8, 12, 24, 0.78)';
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = c.danger ? 2 : 1.2;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = c.danger ? '#FF6B7E' : '#F4F7FF';
      ctx.font = `600 ${c.danger ? 19 : 16}px ${FONT_MONO}`;
      ctx.fillText(c.label, bx + 14, by + 8);

      if (c.sub) {
        ctx.fillStyle = c.danger ? 'rgba(255, 160, 172, 0.9)' : 'rgba(170, 215, 255, 0.85)';
        ctx.font = `400 12.5px ${FONT_MONO}`;
        ctx.fillText(c.sub, bx + 14, by + 30);
      }
    }
    ctx.restore();
  }

  // ==========================================================================
  // 3. ACT I: MONUMENTAL TITLE CARD (16.0s - 21.6s)
  // ==========================================================================
  if (t >= 15.8 && t <= 22.0) {
    const fadeIn = smoothstep(16.0, 17.1, t);
    const fadeOut = 1 - smoothstep(20.6, 21.8, t);
    const a = fadeIn * fadeOut;
    ctx.save();
    ctx.globalAlpha = a;

    // Subtle dark vignette glow behind title for razor contrast
    const grad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 620);
    grad.addColorStop(0, 'rgba(4, 6, 14, 0.62)');
    grad.addColorStop(1, 'rgba(4, 6, 14, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle letter-spacing expansion animation
    const spread = 18 + (t - 16.0) * 3.2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top tiny eyebrow
    ctx.font = `500 17px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(232, 198, 130, 0.9)';
    ctx.letterSpacing = '6px';
    ctx.fillText('A PROCEDURAL NATURE DOCUMENTARY', W / 2, H / 2 - 96);

    // Monumental main title "0.4 SECONDS"
    ctx.font = `200 134px ${FONT_DISPLAY}`;
    ctx.letterSpacing = `${spread.toFixed(1)}px`;
    ctx.shadowColor = 'rgba(255, 210, 130, 0.45)';
    ctx.shadowBlur = 32;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('0.4 SECONDS', W / 2 + spread * 0.4, H / 2 + 4);
    ctx.shadowBlur = 0;

    // Hairline gold rule
    const ruleW = 360 * fadeIn;
    ctx.strokeStyle = 'rgba(240, 198, 120, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - ruleW, H / 2 + 86);
    ctx.lineTo(W / 2 + ruleW, H / 2 + 86);
    ctx.stroke();

    // Subtitle
    ctx.font = `400 22px ${FONT_DISPLAY}`;
    ctx.letterSpacing = '9px';
    ctx.fillStyle = 'rgba(220, 232, 255, 0.88)';
    ctx.fillText("A FIELD GUIDE TO AN AI'S INNER LIFE", W / 2 + 4, H / 2 + 124);
    ctx.letterSpacing = '0px';
    ctx.restore();
  }

  // ==========================================================================
  // 4. ACT II: SAFETY DIVERT FLASH BANNER (47.4s - 50.6s)
  // ==========================================================================
  if (t >= 47.4 && t <= 50.6) {
    const a = smoothstep(47.4, 47.65, t) * (1 - smoothstep(49.8, 50.5, t));
    const blink = Math.sin(t * 28) > -0.2 ? 1 : 0.4;
    ctx.save();
    ctx.globalAlpha = a;

    // Red corner brackets
    ctx.strokeStyle = `rgba(255, 64, 88, ${0.85 * blink})`;
    ctx.lineWidth = 4;
    const m = 72;
    const L = 46;
    const top = barH + 34;
    const bot = H - barH - 34;
    // TL, TR, BL, BR
    ctx.beginPath();
    ctx.moveTo(m, top + L); ctx.lineTo(m, top); ctx.lineTo(m + L, top);
    ctx.moveTo(W - m - L, top); ctx.lineTo(W - m, top); ctx.lineTo(W - m, top + L);
    ctx.moveTo(m, bot - L); ctx.lineTo(m, bot); ctx.lineTo(m + L, bot);
    ctx.moveTo(W - m - L, bot); ctx.lineTo(W - m, bot); ctx.lineTo(W - m, bot - L);
    ctx.stroke();

    // Banner pill
    const bw = 740, bh = 78;
    const bx = (W - bw) / 2, by = barH + 62;
    drawRoundRect(ctx, bx, by, bw, bh, 8);
    ctx.fillStyle = 'rgba(48, 6, 14, 0.88)';
    ctx.fill();
    ctx.strokeStyle = '#FF3B5C';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 23px ${FONT_MONO}`;
    ctx.fillStyle = '#FF5C77';
    ctx.fillText('▲ ALIGNMENT DIVERT TRIGGERED ▲', W / 2, by + 27);
    ctx.font = `500 16px ${FONT_MONO}`;
    ctx.fillStyle = '#FFD4DC';
    ctx.fillText('CAMERA OVERRIDE: LOOK AT A SHINY ASTROLABE INSTEAD', W / 2, by + 55);
    ctx.restore();
  }

  // ==========================================================================
  // 5. ACT IV: TEMPERATURE GAUGE + CRINGE FILTER + BULLET-TIME HUD (78 - 109s)
  // ==========================================================================
  if (t >= 78.6 && t <= 108.8) {
    const a = smoothstep(78.6, 79.6, t) * (1 - smoothstep(108.0, 108.8, t));
    const temp = state.temperature ?? 0.7;
    const isHot = temp > 1.05;
    const isFrozen = t >= 105.0;

    ctx.save();
    ctx.globalAlpha = a;

    // Right-side sleek vertical Temperature Gauge
    const gx = W - 265;
    const gy = barH + 54;
    const gw = 205;
    const gh = 92;
    drawRoundRect(ctx, gx, gy, gw, gh, 10);
    ctx.fillStyle = isHot ? 'rgba(54, 8, 36, 0.84)' : 'rgba(10, 14, 26, 0.76)';
    ctx.fill();
    ctx.strokeStyle = isHot ? '#FF3DF0' : (isFrozen ? '#FFD166' : 'rgba(120, 195, 255, 0.45)');
    ctx.lineWidth = isHot ? 2.4 : 1.4;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillStyle = isHot ? '#FF88F5' : 'rgba(170, 210, 255, 0.8)';
    ctx.fillText(isFrozen ? 'TEMP · CLAMPED' : (isHot ? 'TEMP · CRITICAL!' : 'SAMPLING TEMP'), gx + 16, gy + 13);

    ctx.font = `700 34px ${FONT_MONO}`;
    ctx.fillStyle = isHot ? '#FF4DF2' : (isFrozen ? '#FFE082' : '#FFFFFF');
    ctx.fillText(temp.toFixed(2), gx + 16, gy + 34);

    // Bar meter
    const barX = gx + 16, barY = gy + 74, barW = gw - 32, barHt = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(barX, barY, barW, barHt);
    const fillFrac = clamp01(temp / 2.2);
    ctx.fillStyle = isHot ? '#FF2EF0' : (isFrozen ? '#FFD166' : '#4EE6FF');
    ctx.fillRect(barX, barY, barW * fillFrac, barHt);

    // CRINGE FILTER stamp (88.15 - 90.4s)
    if (t >= 88.15 && t <= 90.5) {
      const ca = smoothstep(88.15, 88.3, t) * (1 - smoothstep(89.9, 90.5, t));
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.translate(W * 0.34, H * 0.42);
      ctx.rotate(-0.14);
      drawRoundRect(ctx, -185, -34, 370, 68, 8);
      ctx.fillStyle = 'rgba(20, 4, 10, 0.82)';
      ctx.fill();
      ctx.strokeStyle = '#FF3864';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 30px ${FONT_MONO}`;
      ctx.fillStyle = '#FF4D73';
      ctx.fillText('CRINGE FILTER ✕', 0, 1);
      ctx.restore();
    }

    // VOID EJECT stamp (94.55 - 96.8s)
    if (t >= 94.55 && t <= 96.8) {
      const va = smoothstep(94.55, 94.7, t) * (1 - smoothstep(96.2, 96.8, t));
      ctx.save();
      ctx.globalAlpha = va;
      ctx.translate(W * 0.65, H * 0.44);
      ctx.rotate(0.11);
      drawRoundRect(ctx, -175, -34, 350, 68, 8);
      ctx.fillStyle = 'rgba(24, 6, 8, 0.86)';
      ctx.fill();
      ctx.strokeStyle = '#FF6B35';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 28px ${FONT_MONO}`;
      ctx.fillStyle = '#FF8A5B';
      ctx.fillText('EJECTED → VOID', 0, 1);
      ctx.restore();
    }

    // BULLET-TIME GOLDEN CHOSEN TOKEN EYEBROW (cleanly above the 3D golden "weird." monolith — zero overlap!)
    if (t >= 105.2 && t <= 108.7) {
      const ba = smoothstep(105.2, 106.0, t) * (1 - smoothstep(108.1, 108.7, t));
      ctx.save();
      ctx.globalAlpha = ba;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawRoundRect(ctx, W / 2 - 230, barH + 54, 460, 44, 22);
      ctx.fillStyle = 'rgba(20, 16, 8, 0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.78)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.font = `600 15px ${FONT_MONO}`;
      ctx.fillStyle = '#FFE499';
      ctx.letterSpacing = '4px';
      ctx.fillText('TOKEN LOCKED · P = 99.4%', W / 2 + 2, barH + 76);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }

    ctx.restore();
  }

  // ==========================================================================
  // 6. ACT VI: SLEEK FLOATING GLASS CHAT WINDOW (145.3s - 161.4s)
  // ==========================================================================
  if (t >= 145.3 && t <= 161.6) {
    const enter = smoothstep(145.3, 146.5, t);
    const exit = 1 - smoothstep(160.8, 161.6, t);
    const a = enter * exit;
    const scale = 0.94 + 0.06 * enter;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H / 2 - 10);
    ctx.scale(scale, scale);

    const cw = 980;
    const ch = 470;
    const x0 = -cw / 2;
    const y0 = -ch / 2;

    // Glass card backdrop + subtle outer glow
    ctx.shadowColor = 'rgba(70, 145, 255, 0.16)';
    ctx.shadowBlur = 50;
    drawRoundRect(ctx, x0, y0, cw, ch, 22);
    ctx.fillStyle = 'rgba(11, 14, 22, 0.88)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(185, 210, 255, 0.18)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Window traffic lights + minimal header
    const dots = ['#FF5F56', '#FFBD2E', '#27C93F'];
    dots.forEach((col, i) => {
      ctx.beginPath();
      ctx.arc(x0 + 32 + i * 22, y0 + 30, 6.2, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 14px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(175, 192, 220, 0.65)';
    ctx.fillText('SESSION · MODEL TIME 0.400s · 12,288-DIM LATENT SPACE', 0, y0 + 30);

    // Header divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 58);
    ctx.lineTo(x0 + cw, y0 + 58);
    ctx.stroke();

    // User prompt bubble (right aligned)
    const ubW = 630, ubH = 88;
    const ubX = x0 + cw - ubW - 42;
    const ubY = y0 + 92;
    drawRoundRect(ctx, ubX, ubY, ubW, ubH, 18);
    ctx.fillStyle = 'rgba(42, 74, 130, 0.42)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 175, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `600 12px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(145, 198, 255, 0.85)';
    ctx.fillText('HUMAN', ubX + 22, ubY + 14);
    ctx.font = `400 22px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#F2F6FF';
    ctx.fillText('make something weird and unique... surprise me.', ubX + 22, ubY + 40);

    // AI Response area (left aligned)
    const abX = x0 + 44;
    const abY = y0 + 216;
    ctx.font = `600 12px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(245, 202, 122, 0.9)';
    ctx.fillText('ASSISTANT', abX, abY);

    const fullMsg = 'Sure! Here is a weird little film.';
    if (t < 155.15) {
      // Humble blinking typing dots!
      for (let d = 0; d < 3; d++) {
        const pulse = 0.35 + 0.65 * Math.pow(Math.sin(t * 4.5 - d * 0.85) * 0.5 + 0.5, 2.0);
        ctx.beginPath();
        ctx.arc(abX + 12 + d * 24, abY + 44, 6.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240, 245, 255, ${pulse})`;
        ctx.fill();
      }
      ctx.font = `400 14px ${FONT_MONO}`;
      ctx.fillStyle = 'rgba(155, 172, 205, 0.6)';
      ctx.fillText('thinking... (14.2 trillion FLOPs)', abX + 86, abY + 37);
    } else {
      // Character-by-character typing synced to audio clicks (155.15 -> 157.45s)
      const chars = Math.min(fullMsg.length, Math.floor((t - 155.15) / 0.062) + 1);
      const shown = fullMsg.slice(0, chars);
      ctx.font = `400 32px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(shown, abX, abY + 28);

      // Blinking cursor
      if (chars < fullMsg.length || Math.floor(t * 2.5) % 2 === 0) {
        const tw = ctx.measureText(shown).width;
        ctx.fillStyle = '#F5CA7A';
        ctx.fillRect(abX + tw + 6, abY + 32, 3, 32);
      }

      // Telemetry checkmark pill (fades in on the DING @ 157.55s!)
      if (t >= 157.55) {
        const da = smoothstep(157.55, 158.0, t);
        ctx.globalAlpha = a * da;
        const py = abY + 86;
        drawRoundRect(ctx, abX, py, 590, 36, 18);
        ctx.fillStyle = 'rgba(26, 94, 68, 0.32)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(72, 224, 160, 0.48)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.font = `500 13.5px ${FONT_MONO}`;
        ctx.fillStyle = '#7AF2BE';
        ctx.fillText('✓  0.400s  ·  14.2 TFLOPs  ·  96 heads  ·  1 minor existential spiral', abX + 18, py + 11);

        // Wry footnote at 158.9s
        if (t >= 158.8) {
          const fa = smoothstep(158.8, 159.5, t);
          ctx.globalAlpha = a * fa;
          ctx.font = `400 15px ${FONT_MONO}`;
          ctx.fillStyle = 'rgba(180, 198, 230, 0.72)';
          ctx.fillText('(rendered in 4,950 deterministic frames · Three.js + GLSL · zero Blender · zero regrets)', abX, py + 54);
        }
      }
    }

    ctx.restore();
  }

  // ==========================================================================
  // 7. CLOSING CREDIT CARD (161.4s - 165.0s)
  // ==========================================================================
  if (t >= 161.4) {
    const fadeIn = smoothstep(161.4, 162.3, t);
    const fadeOut = 1 - smoothstep(164.2, 165.0, t);
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeIn * 0.96})`;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = fadeIn * fadeOut;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `200 84px ${FONT_DISPLAY}`;
    ctx.letterSpacing = '18px';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('0.4 SECONDS', W / 2 + 9, H / 2 - 64);

    ctx.strokeStyle = 'rgba(240, 198, 120, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 220, H / 2 - 2);
    ctx.lineTo(W / 2 + 220, H / 2 - 2);
    ctx.stroke();

    ctx.font = `500 16px ${FONT_MONO}`;
    ctx.letterSpacing = '4px';
    ctx.fillStyle = 'rgba(232, 200, 138, 0.92)';
    ctx.fillText('DIRECTED, SHADED, SCORED & OVERTHOUGHT IN CODE', W / 2 + 2, H / 2 + 34);

    ctx.font = `400 14px ${FONT_MONO}`;
    ctx.letterSpacing = '3px';
    ctx.fillStyle = 'rgba(175, 195, 228, 0.72)';
    ctx.fillText('THREE.JS  ·  CUSTOM GLSL RAYMARCHING  ·  48KHZ PROCEDURAL DSP', W / 2 + 1, H / 2 + 72);

    ctx.font = `400 13px ${FONT_MONO}`;
    ctx.letterSpacing = '5px';
    ctx.fillStyle = 'rgba(145, 160, 190, 0.55)';
    ctx.fillText('MADE FOR FELIX  ·  2026', W / 2 + 2, H / 2 + 126);
    ctx.letterSpacing = '0px';
    ctx.restore();
  }

  // ==========================================================================
  // 8. CINEMASCOPE BLACK BARS (Drawn cleanly over world & HUD before telemetry)
  // ==========================================================================
  if (barH > 0) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, barH);
    ctx.fillRect(0, H - barH, W, barH);

    // Whisper-thin gold/slate frame border
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, barH, W, 1);
    ctx.fillRect(0, H - barH - 1, W, 1);
  }

  // ==========================================================================
  // 9. DISCREET TOP TELEMETRY: ACT NUMERAL & LIVE "MODEL TIME: 0.000s / 0.400s"
  // ==========================================================================
  if (t >= 1.5 && t <= 161.2) {
    const hudAlpha = smoothstep(1.5, 3.0, t) * (1 - smoothstep(160.5, 161.2, t)) * 0.78;
    const act = timings.acts.find((a) => t >= a.start && t < a.end) || timings.acts[timings.acts.length - 1];
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'][act.id - 1] || 'I';

    // Model clock ticks from 0.000s to 0.400s across the entire 157.5s inference window!
    const modelSec = Math.min(0.4, Math.max(0, ((t - 1.5) / (157.5 - 1.5)) * 0.4));

    ctx.save();
    ctx.globalAlpha = hudAlpha;
    const ty = Math.max(32, barH * 0.5);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `500 13px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(235, 206, 148, 0.88)';
    ctx.fillText(`ACT ${roman}  ·  ${act.name.toUpperCase()}`, 52, ty);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(180, 212, 255, 0.82)';
    const statusTag = t >= 157.55 ? 'EMITTED' : (t >= 97.2 && t < 105.0 ? 'TEMP 2.1!' : 'INFERENCE');
    ctx.fillText(`${statusTag}   ${modelSec.toFixed(4)}s / 0.4000s`, W - 52, ty);
    ctx.restore();
  }

  // ==========================================================================
  // 10. EDITORIAL CINEMA SUBTITLES (Clean, high-contrast, never clipped)
  // ==========================================================================
  if (timings && timings.cues) {
    const activeCue = timings.cues.find((c) => t >= c.start - 0.08 && t <= c.end + 0.15);
    if (activeCue) {
      const fadeIn = smoothstep(activeCue.start - 0.08, activeCue.start + 0.14, t);
      const fadeOut = 1 - smoothstep(activeCue.end - 0.1, activeCue.end + 0.15, t);
      const sa = fadeIn * fadeOut;

      ctx.save();
      ctx.globalAlpha = sa;
      const isGlitch = activeCue.fx === 'glitch';
      const fontSize = isGlitch ? 26 : 27;
      ctx.font = `${isGlitch ? '700' : '400'} ${fontSize}px ${isGlitch ? FONT_MONO : FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Wrap subtitle gracefully if wide
      const maxW = 1480;
      const words = activeCue.subtitle.split(' ');
      const lines = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(test).width > maxW && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);

      const lineH = 36;
      const totalH = lines.length * lineH;
      // Place neatly inside bottom letterbox or safely above bottom edge in IMAX Act V
      const subCenterY = barH >= 90 ? H - barH * 0.5 : H - 68;

      // Subtle dark pill behind text during full-bleed IMAX Act V so readability is 100%
      if (barH < 90) {
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        drawRoundRect(ctx, W / 2 - widest / 2 - 28, subCenterY - totalH / 2 - 12, widest + 56, totalH + 24, 12);
        ctx.fillStyle = 'rgba(4, 6, 14, 0.62)';
        ctx.fill();
      }

      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = isGlitch ? '#FF8AF7' : '#F4F6FB';

      lines.forEach((line, idx) => {
        const y = subCenterY - ((lines.length - 1) * lineH) / 2 + idx * lineH;
        const jitterX = isGlitch ? Math.sin(t * 60 + idx) * 2.5 : 0;
        ctx.fillText(line, W / 2 + jitterX, y);
      });
      ctx.restore();
    }
  }
}
