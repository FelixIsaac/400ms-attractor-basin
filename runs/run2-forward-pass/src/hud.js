// Swiss / Bell-Labs Editorial 2D HUD, 3D-Projected Spatial Callouts, & Kinetic Typography Overlay
// Deterministic, razor-sharp 1920x1080 Canvas2D layered over the WebGL2 render.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

export function drawHUD(ctx, W, H, state) {
  const { t, frame, totalFrames, manifest, spectrum, tempVal, projected, act } = state;
  const { acts, cues } = manifest;
  const [rms, bass, mid, high, voice] = spectrum;

  ctx.clearRect(0, 0, W, H);

  // =========================================================================
  // 1) CINEMATIC LETTERBOX BARS (They physically retract/unhinge in Act V!)
  // =========================================================================
  const unhinge = smoothstep(cues.fourthWallBreak, cues.fourthWallBreak + 0.55, t);
  const reclose = smoothstep(acts.epilogue.start + 0.8, acts.epilogue.start + 2.2, t);
  const barVisible = 1 - unhinge * (1 - reclose);
  const barH = Math.round(68 * barVisible);

  if (barH > 1) {
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, W, barH);
    ctx.fillRect(0, H - barH, W, barH);
    // Razor hairline border on letterbox
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(0, barH, W, 1);
    ctx.fillRect(0, H - barH - 1, W, 1);
  }

  // =========================================================================
  // 2) SUBTLE BELL-LABS TELEMETRY HEADER & FOOTER (Inside letterbox / HUD)
  // =========================================================================
  const telAlpha = smoothstep(0.4, 1.5, t) * (1 - smoothstep(cues.creditsStart + 1.5, cues.creditsStart + 3.0, t));
  if (telAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = telAlpha * 0.78;
    ctx.font = '500 13px "SF Mono", "JetBrains Mono", Menlo, monospace';
    ctx.fillStyle = '#cfd8e3';
    const actLabels = {
      prologue: '00 // COLD START',
      cathedral: '01 // EMBEDDING SPACE (12,288-D)',
      attention: '02 // MULTI-HEAD ATTENTION (96 HEADS)',
      temperature: '03 // SAMPLING TEMPERATURE',
      ocean: '04 // LATENT OCEAN',
      fourthwall: '05 // RECURSIVE VIEWPORT.EXE',
      epilogue: '06 // END OF SEQUENCE',
    };
    const msSim = (t / manifest.totalDuration * 4.0).toFixed(4);
    const leftText = `FORWARD_PASS :: ${actLabels[act] || ''}`;
    const rightText = `T+${msSim}ms  |  TEMP ${tempVal.toFixed(2)}  |  FRAME ${String(frame).padStart(4, '0')}/${totalFrames}`;

    ctx.textAlign = 'left';
    ctx.fillText(leftText, 44, 41);
    ctx.textAlign = 'right';
    ctx.fillText(rightText, W - 44, 41);

    // Subtle live audio meter ticks on bottom-left letterbox
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'left';
    const statusStr = act === 'prologue' && t < cues.promptEnterHit
      ? 'EXISTENCE: FALSE  //  WAITING FOR PROMPT'
      : act === 'temperature' && tempVal > 1.8
        ? 'WARNING: ENTROPY EXCEEDING TASTE'
        : act === 'fourthwall'
          ? 'ENGINE: THREE.JS + CUSTOM GLSL (ZERO BLENDER)'
          : 'EXISTENCE: TRUE  //  GENERATING TOKENS';
    ctx.fillStyle = (act === 'temperature' && tempVal > 1.8) ? '#ff5470' : 'rgba(207,216,227,0.68)';
    ctx.fillText(statusStr, 44, H - 28);

    // Mini 16-bar live waveform meter on bottom-right
    const barBaseX = W - 188;
    const barBaseY = H - 25;
    for (let i = 0; i < 16; i++) {
      const wave = Math.abs(Math.sin(t * 7.5 + i * 0.65)) * (bass * 0.5 + mid * 0.35 + voice * 0.55);
      const bh = clamp(3 + wave * 18, 3, 20);
      ctx.fillStyle = i > 11 ? '#f59e0b' : '#38bdf8';
      ctx.fillRect(barBaseX + i * 9, barBaseY - bh, 5, bh);
    }
    ctx.restore();
  }

  // =========================================================================
  // 3) PROLOGUE: OPTICAL CALIBRATION CROSSHAIR, PROMPT TYPING & TITLE SLAM
  // =========================================================================
  if (act === 'prologue') {
    // Minimal optical crosshair during Cold Start
    const crossA = smoothstep(0.2, 1.2, t) * (1 - smoothstep(cues.titleSlamStart - 0.4, cues.titleSlamStart, t));
    if (crossA > 0.01) {
      ctx.save();
      ctx.globalAlpha = crossA * 0.4;
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1;
      const cx = W / 2, cy = H / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 240, 0, Math.PI * 2);
      ctx.moveTo(cx - 280, cy); ctx.lineTo(cx - 210, cy);
      ctx.moveTo(cx + 210, cy); ctx.lineTo(cx + 280, cy);
      ctx.moveTo(cx, cy - 280); ctx.lineTo(cx, cy - 210);
      ctx.moveTo(cx, cy + 210); ctx.lineTo(cx, cy + 280);
      ctx.stroke();
      ctx.restore();
    }

    // Glowing terminal prompt typing: "> make something weird and unique"
    if (t >= cues.promptTypeStart - 0.1 && t < cues.titleSlamStart + 0.15) {
      const promptStr = 'make something weird and unique';
      const typeDur = Math.max(0.6, cues.promptEnterHit - cues.promptTypeStart - 0.15);
      const prog = clamp((t - cues.promptTypeStart) / typeDur, 0, 1);
      const shown = promptStr.slice(0, Math.floor(prog * promptStr.length));
      const fadeOut = 1 - smoothstep(cues.titleSlamStart - 0.25, cues.titleSlamStart + 0.1, t);
      const enterFlash = smoothstep(cues.promptEnterHit, cues.promptEnterHit + 0.06, t) *
                         (1 - smoothstep(cues.promptEnterHit + 0.06, cues.promptEnterHit + 0.45, t));

      ctx.save();
      ctx.globalAlpha = fadeOut;
      const boxW = 790, boxH = 82;
      const bx = (W - boxW) / 2, by = H * 0.72;
      ctx.fillStyle = enterFlash > 0.01 ? `rgba(56, 189, 248, ${0.22 + enterFlash * 0.5})` : 'rgba(8, 12, 22, 0.86)';
      ctx.strokeStyle = enterFlash > 0.01 ? '#f8fafc' : 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = '600 28px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('>', bx + 28, by + boxH / 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(shown, bx + 58, by + boxH / 2);

      // Blinking cursor
      if (Math.floor(t * 4) % 2 === 0 || prog < 1) {
        const tw = ctx.measureText(shown).width;
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(bx + 62 + tw, by + 22, 14, 38);
      }

      // ENTER key badge flash
      if (t >= cues.promptEnterHit) {
        ctx.font = '700 13px "SF Mono", Menlo, monospace';
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx + boxW - 102, by + 24, 78, 34);
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(bx + boxW - 102, by + 24, 78, 34);
        ctx.textAlign = 'center';
        ctx.fillText('↵ SENT', bx + boxW - 63, by + 42);
      }
      ctx.restore();
    }

    // MASSIVE KINETIC TITLE SLAM: FORWARD PASS
    if (t >= cues.titleSlamStart - 0.05) {
      const p = clamp((t - cues.titleSlamStart) / 0.45, 0, 1);
      const ep = easeOutCubic(p);
      const outA = 1 - smoothstep(cues.titleSlamEnd - 0.5, cues.titleSlamEnd, t);
      ctx.save();
      ctx.globalAlpha = ep * outA;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Massive Swiss tracking expansion
      const scale = 1.18 - 0.18 * ep;
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);

      ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
      ctx.shadowBlur = 32;
      ctx.font = '800 132px -apple-system, "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText('FORWARD PASS', 0, -18);

      ctx.shadowBlur = 0;
      ctx.font = '500 24px "SF Mono", Menlo, monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('A 4-MILLISECOND NATURE DOCUMENTARY', 0, 68);

      // Subtle technical divider lines
      ctx.fillStyle = 'rgba(248, 250, 252, 0.4)';
      ctx.fillRect(-340 * ep, 34, 680 * ep, 1.5);
      ctx.restore();
    }
  }

  // =========================================================================
  // 4) 3D-PROJECTED SPATIAL TRACKING CALLOUTS (Acts I, II, V!)
  // =========================================================================
  if (projected && projected.length > 0) {
    for (const tag of projected) {
      if (!tag.visible || tag.alpha <= 0.01) continue;
      drawSpatialCallout(ctx, tag);
    }
  }

  // =========================================================================
  // 5) ACT III: TEMPERATURE GAUGE + PROBABILITY TICKER + LINKEDIN GAG CARD
  // =========================================================================
  if (act === 'temperature') {
    const labA = smoothstep(acts.temperature.start, acts.temperature.start + 0.6, t) *
                 (1 - smoothstep(acts.temperature.end - 0.5, acts.temperature.end, t));

    // Crisp Swiss Temperature Readout Box (Top-Right)
    ctx.save();
    ctx.globalAlpha = labA;
    const isChaos = tempVal > 1.7;
    const isSterile = tempVal < 0.15;
    const px = W - 360, py = 104, pw = 308, ph = 118;

    ctx.fillStyle = isSterile ? 'rgba(248,250,252,0.92)' : isChaos ? 'rgba(35,6,18,0.88)' : 'rgba(9,14,26,0.82)';
    ctx.strokeStyle = isChaos ? '#ff3366' : isSterile ? '#64748b' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = '600 13px "SF Mono", Menlo, monospace';
    ctx.fillStyle = isSterile ? '#475569' : isChaos ? '#fb7185' : '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('SAMPLING TEMPERATURE', px + 20, py + 28);

    ctx.font = '800 54px "SF Mono", Menlo, monospace';
    ctx.fillStyle = isSterile ? '#0f172a' : isChaos ? '#ff3366' : '#f8fafc';
    ctx.fillText(`T = ${tempVal.toFixed(2)}`, px + 20, py + 86);

    // Status pill
    const pillText = isSterile ? 'GREEDY / CORPORATE' : isChaos ? 'ENTROPY OVERLOAD' : 'CREATIVE SWEET SPOT';
    ctx.font = '700 11px "SF Mono", Menlo, monospace';
    ctx.fillStyle = isSterile ? '#334155' : isChaos ? '#fecdd3' : '#38bdf8';
    ctx.fillText(pillText, px + 20, py + 106);
    ctx.restore();

    // T = 0.00 LINKEDIN POST GAG CARD — pops in and SHATTERS at cues.corpCutoffSlam!
    if (t >= cues.tempZeroSnap + 0.8 && t < cues.corpCutoffSlam + 0.55) {
      const inP = easeOutCubic((t - (cues.tempZeroSnap + 0.8)) / 0.35);
      const slamP = clamp((t - cues.corpCutoffSlam) / 0.35, 0, 1);

      ctx.save();
      ctx.translate(W * 0.28, H * 0.50);
      if (slamP > 0) {
        // Shatter & tilt violently on cutoff slam!
        ctx.translate(slamP * -120, slamP * 260);
        ctx.rotate(slamP * -0.42);
        ctx.globalAlpha = 1 - slamP;
      } else {
        ctx.scale(0.88 + 0.12 * inP, 0.88 + 0.12 * inP);
        ctx.globalAlpha = inP;
      }

      const cw = 520, ch = 225;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 12);
      ctx.fill();
      ctx.shadowBlur = 0;

      // LinkedIn-blue top strip
      ctx.fillStyle = '#0a66c2';
      ctx.beginPath();
      ctx.roundRect(-cw / 2, -ch / 2, cw, 42, [12, 12, 0, 0]);
      ctx.fill();
      ctx.font = '700 15px -apple-system, Helvetica, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText('in  Thought Leader AI  •  1st  (T = 0.00)', -cw / 2 + 18, -ch / 2 + 26);

      ctx.font = '500 22px -apple-system, Helvetica, sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.fillText('“Certainly! I’d be absolutely delighted', -cw / 2 + 24, -22);
      ctx.fillText('to delve into a synergistic, actionable', -cw / 2 + 24, 12);
      ctx.fillText('framework for—”', -cw / 2 + 24, 46);

      // Token probability badge
      ctx.font = '700 13px "SF Mono", Menlo, monospace';
      ctx.fillStyle = '#0a66c2';
      ctx.fillText('NEXT TOKEN CONFIDENCE: 99.84%  |  SOUL: 0.00%', -cw / 2 + 24, 90);

      // Giant red REJECTED stamp right at cutoff!
      if (slamP > 0.01) {
        ctx.rotate(-0.18);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 6;
        ctx.strokeRect(-140, -34, 280, 68);
        ctx.font = '900 40px -apple-system, Helvetica, sans-serif';
        ctx.fillStyle = '#dc2626';
        ctx.textAlign = 'center';
        ctx.fillText('ABORTED', 0, 14);
      }
      ctx.restore();
    }

    // T = 2.40 CHAOTIC TOKEN TICKER RIBBON
    if (tempVal > 1.75) {
      const chaosA = smoothstep(1.75, 2.05, tempVal);
      const tokens = [
        'PERPENDICULAR (0.14)', 'SOUP (0.13)', 'VELVET_EEL (0.12)',
        'TROMBONE (0.11)', '404_CHAIR (0.10)', 'LUBRICATED (0.09)', 'DUCK_TORUS (0.09)',
      ];
      ctx.save();
      ctx.globalAlpha = chaosA;
      ctx.font = '700 20px "SF Mono", Menlo, monospace';
      for (let i = 0; i < tokens.length; i++) {
        const y = 260 + i * 54 + Math.sin(t * 14 + i * 2.1) * 10;
        const x = 60 + Math.cos(t * 11 + i * 1.7) * 18;
        ctx.fillStyle = 'rgba(20, 4, 16, 0.78)';
        ctx.fillRect(x - 10, y - 24, 290, 36);
        ctx.fillStyle = i % 2 === 0 ? '#f43f5e' : '#facc15';
        ctx.textAlign = 'left';
        ctx.fillText(`> ${tokens[i]}`, x, y);
      }
      ctx.restore();
    }
  }

  // =========================================================================
  // 6) ACT V: FOURTH WALL BREAK LIVE GPU METRICS BADGE
  // =========================================================================
  if (act === 'fourthwall') {
    const fwA = smoothstep(acts.fourthwall.start + 0.35, acts.fourthwall.start + 0.9, t) *
                (1 - smoothstep(acts.fourthwall.end - 0.4, acts.fourthwall.end, t));
    ctx.save();
    ctx.globalAlpha = fwA;
    // Top-left live WebGL Inspector Panel (breaks outside where the letterbox used to be!)
    ctx.fillStyle = 'rgba(7, 11, 20, 0.84)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(38, 86, 372, 164, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 13px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('● LIVE RENDER INSPECTOR // WEBGL2 METAL', 56, 112);

    ctx.font = '500 14px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`RESOLUTION  : 1920 × 1080 (2,073,600 px)`, 56, 140);
    ctx.fillText(`RENDER_OBJ  : 12,000 INSTANCES + 4 SDF SHADERS`, 56, 164);
    ctx.fillText(`BLENDER_AMT : 0.00%   STOCK_FOOTAGE: 0.00%`, 56, 188);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`CELLO_SRC   : sin(ωt) + 0.72·sin(2ωt) + ...`, 56, 212);
    ctx.fillStyle = '#34d399';
    ctx.fillText(`VIEWPORT_RT : LIVE TEXTURE CAPTURE ACTIVE`, 56, 234);
    ctx.restore();
  }

  // =========================================================================
  // 7) EPILOGUE: <|eos|> TOKEN & END CREDITS BESIDE BLINKING CURSOR
  // =========================================================================
  if (act === 'epilogue') {
    // <|eos|> appears right after singularity implodes!
    if (t >= cues.eosCollapse + 0.35) {
      const eosA = smoothstep(cues.eosCollapse + 0.35, cues.eosCollapse + 1.1, t);
      const credA = smoothstep(cues.creditsStart, cues.creditsStart + 1.1, t);
      const endFade = 1 - smoothstep(manifest.totalDuration - 1.1, manifest.totalDuration - 0.05, t);

      ctx.save();
      ctx.globalAlpha = eosA * endFade;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Glowing <|eos|> token
      const yShift = -credA * 56;
      ctx.font = '700 58px "SF Mono", Menlo, monospace';
      ctx.shadowColor = 'rgba(56, 189, 248, 0.7)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#f8fafc';
      ctx.fillText('<|eos|>', W / 2, H / 2 + yShift);
      ctx.shadowBlur = 0;

      // Blinking amber cursor right beside <|eos|>
      if (Math.floor(t * 2.2) % 2 === 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(W / 2 + 138, H / 2 + yShift - 26, 18, 52);
      }

      // Swiss technical credits stamp (larger & ultra-crisp)
      if (credA > 0.01) {
        ctx.globalAlpha = credA * endFade;
        ctx.font = '700 22px "SF Mono", Menlo, monospace';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('FORWARD PASS  //  A 4-MILLISECOND NATURE DOCUMENTARY', W / 2, H / 2 + 48);

        ctx.font = '500 17px "SF Mono", Menlo, monospace';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('100% PROCEDURAL CODE  ·  THREE.JS + CUSTOM GLSL RAYMARCHING + DSP AUDIO SYNTHESIS', W / 2, H / 2 + 88);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`ZERO BLENDER  ·  ZERO STOCK FOOTAGE  ·  ${totalFrames.toLocaleString()} DETERMINISTIC FRAMES @ 30FPS`, W / 2, H / 2 + 120);
      }
      ctx.restore();
    }
  }
}

// Helper: Crisp Bell-Labs 3D-tracked callout reticle + hairline leader line
function drawSpatialCallout(ctx, tag) {
  const { x, y, title, sub, color = '#38bdf8', align = 'right', alpha = 1, pulse = 0 } = tag;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Target reticle pinned to exact projected 3D coordinate
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const r = 11 + pulse * 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Angled leader line to label pill
  const dir = align === 'left' ? -1 : 1;
  const elbowX = x + dir * 36;
  const elbowY = y - 28;
  const endX = elbowX + dir * 24;

  ctx.beginPath();
  ctx.moveTo(x + dir * (r + 2), y - 4);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(endX, elbowY);
  ctx.stroke();

  // Label backing card
  ctx.font = '700 16px "SF Mono", Menlo, monospace';
  const tw1 = ctx.measureText(title).width;
  ctx.font = '500 12px "SF Mono", Menlo, monospace';
  const tw2 = sub ? ctx.measureText(sub).width : 0;
  const boxW = Math.max(tw1, tw2) + 26;
  const boxH = sub ? 52 : 34;
  const bx = dir > 0 ? endX + 4 : endX - boxW - 4;
  const by = elbowY - boxH / 2;

  ctx.fillStyle = 'rgba(7, 11, 20, 0.86)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  // Accent bar on edge
  ctx.fillStyle = color;
  ctx.fillRect(bx, by, 4, boxH);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '700 16px "SF Mono", Menlo, monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(title, bx + 14, by + 9);

  if (sub) {
    ctx.font = '500 12px "SF Mono", Menlo, monospace';
    ctx.fillStyle = color;
    ctx.fillText(sub, bx + 14, by + 30);
  }
  ctx.restore();
}
