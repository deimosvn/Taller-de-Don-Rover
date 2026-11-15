// SCAN THE WORLD: la cámara convierte objetos del salón en misiones.
// 1) Visión local (TensorFlow.js, en este dispositivo) con recuadros en vivo.
// 2) Si hay clave, Claude analiza la foto con visión multimodal.
// 3) Alternativas: subir foto, votación de la clase o elegir la misión.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CATEGORIES, CATEGORY_LINES, MISSIONS, MISSION_ORDER, ROLE_ORDER, SCAN_CATEGORIES } from '../../../shared/content';
import type { CategoryId, HostView, MissionId, ScanResult } from '../../../shared/types';
import { aiStatus, classifyImage } from '../../engine/ai';
import { brightFraction, categorize, labelFor, loadDetector, type Prediction } from '../../engine/vision';
import { Astronaut, IXOrb, MissionPatch } from '../../components/art';
import { MISSION_ZONE, ROLE_AVATARS } from '../../world/react/missionZones';
import { PlanetView } from '../../world/react/PlanetView';
import { useHostSnapshot } from '../../world/react/useHostSnapshot';
import { Icon } from '../../components/ui';
import { sfx } from '../../lib/sound';
import type { Run } from './Console';

type Mode = 'camera' | 'upload' | 'vote' | 'mission';

interface Analysis {
  image: string | null;
  scan: ScanResult | null;
  status: 'analyzing' | 'done' | 'unknown';
}

const MAX_SIDE = 1024;

function frameToCanvas(src: HTMLVideoElement | HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- cámara ---------------- */

function CameraScan({ onCapture }: { onCapture: (c: HTMLCanvasElement) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [cam, setCam] = useState<'starting' | 'live' | 'error'>('starting');
  const [camError, setCamError] = useState('');
  const [det, setDet] = useState<'loading' | 'ready' | 'error'>('loading');
  const [seen, setSeen] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCam('error');
      setCamError('La cámara solo funciona en una página segura (HTTPS o localhost). Usa “Subir foto” o la votación.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const v = videoRef.current!;
        v.srcObject = s;
        void v.play();
        setCam('live');
      })
      .catch((e: Error) => {
        setCam('error');
        setCamError(e.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en el navegador o usa “Subir foto”.' : 'No encontramos una cámara disponible.');
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    loadDetector()
      .then(() => setDet('ready'))
      .catch(() => setDet('error'));
  }, []);

  useEffect(() => {
    if (cam !== 'live' || det !== 'ready') return;
    let alive = true;
    const draw = (preds: Prediction[]) => {
      const v = videoRef.current;
      const c = overlayRef.current;
      if (!v || !c) return;
      const cw = (c.width = c.clientWidth * devicePixelRatio);
      const ch = (c.height = c.clientHeight * devicePixelRatio);
      const k = Math.max(cw / v.videoWidth, ch / v.videoHeight);
      const ox = (cw - v.videoWidth * k) / 2;
      const oy = (ch - v.videoHeight * k) / 2;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, cw, ch);
      ctx.lineWidth = 3 * devicePixelRatio;
      ctx.font = `700 ${15 * devicePixelRatio}px "Space Mono", monospace`;
      for (const p of preds) {
        if (p.class === 'person') continue;
        const [x, y, w, h] = p.bbox;
        const bx = x * k + ox;
        const by = y * k + oy;
        ctx.strokeStyle = '#FFC93C';
        ctx.setLineDash([10 * devicePixelRatio, 6 * devicePixelRatio]);
        ctx.strokeRect(bx, by, w * k, h * k);
        ctx.setLineDash([]);
        const label = `${labelFor(p.class)} ${Math.round(p.score * 100)}%`;
        const tw = ctx.measureText(label).width + 14 * devicePixelRatio;
        ctx.fillStyle = '#FFC93C';
        ctx.fillRect(bx, by - 24 * devicePixelRatio, tw, 22 * devicePixelRatio);
        ctx.fillStyle = '#2a120d';
        ctx.fillText(label, bx + 7 * devicePixelRatio, by - 8 * devicePixelRatio);
      }
    };
    const loop = async () => {
      while (alive) {
        try {
          const d = await loadDetector();
          const v = videoRef.current;
          if (v && v.readyState >= 2) {
            const preds = await d.detect(v, 6, 0.45);
            if (!alive) break;
            draw(preds);
            const top = preds.filter((p) => p.class !== 'person').sort((a, b) => b.score - a.score)[0];
            setSeen(top ? labelFor(top.class) : '');
          }
        } catch {
          /* fotograma perdido */
        }
        await sleep(450);
      }
    };
    void loop();
    return () => {
      alive = false;
    };
  }, [cam, det]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || cam !== 'live') return;
    sfx.scan();
    onCapture(frameToCanvas(v, v.videoWidth, v.videoHeight));
  };

  return (
    <div className="cam-wrap">
      <div className={`cam ${cam}`}>
        <video ref={videoRef} muted playsInline />
        <canvas ref={overlayRef} className="cam-overlay" />
        <div className="hud" aria-hidden="true">
          <i className="c1" />
          <i className="c2" />
          <i className="c3" />
          <i className="c4" />
          <div className="sweep" />
          <span className="hud-title">DON ROVER AI SCANNER</span>
          <span className="hud-status">
            {det === 'loading' ? 'cargando visión local…' : det === 'ready' ? (seen ? `detectando: ${seen}` : 'apunta a un objeto') : 'visión local no disponible'}
          </span>
        </div>
        {cam === 'starting' && (
          <div className="cam-msg">
            <IXOrb size={70} mood="talk" />
            <p>Encendiendo la cámara…</p>
          </div>
        )}
        {cam === 'error' && (
          <div className="cam-msg">
            <IXOrb size={70} mood="alert" />
            <p>{camError}</p>
          </div>
        )}
      </div>
      <div className="cam-actions">
        <button className="btn huge mars" onClick={capture} disabled={cam !== 'live'}>
          <Icon name="camera" size={28} /> Escanear objeto
        </button>
        <p className="fine">{aiStatus().enabled ? 'Claude analizará la foto con visión multimodal.' : 'La foto se analiza en este dispositivo y no se guarda.'}</p>
      </div>
    </div>
  );
}

/* ---------------- subir foto ---------------- */

function UploadScan({ onImage }: { onImage: (c: HTMLCanvasElement) => void }) {
  const [drag, setDrag] = useState(false);
  const load = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      onImage(frameToCanvas(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };
  return (
    <label
      className={`dropzone ${drag ? 'drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        load(e.dataTransfer.files[0]);
      }}
    >
      <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => load(e.target.files?.[0])} />
      <Icon name="upload" size={48} />
      <b>Arrastra una foto o haz clic para elegirla</b>
      <span>Planta, botella, lámpara, celular, cartón… ¡lo que haya en el salón!</span>
    </label>
  );
}

/* ---------------- votación ---------------- */

function VoteScan({ view, run, onWinner }: { view: HostView; run: Run; onWinner: (c: CategoryId) => void }) {
  const ov = view.objectVote;
  if (!ov) {
    return (
      <div className="vote-start">
        <IXOrb size={90} mood="talk" />
        <p>
          Los equipos votan desde sus celulares qué objeto del salón quieren explorar. Ideal cuando no hay cámara… o cuando quieres que la clase decida.
        </p>
        <button className="btn big water" onClick={() => run({ type: 'objectVoteStart', options: SCAN_CATEGORIES })}>
          <Icon name="vote" /> Abrir votación
        </button>
      </div>
    );
  }
  const max = Math.max(1, ...ov.options.map((o) => ov.counts[o] ?? 0));
  return (
    <div className="vote-live">
      <div className="vote-options">
        {ov.options.map((o) => {
          const n = ov.counts[o] ?? 0;
          return (
            <div key={o} className="vote-opt card">
              <span className="vote-emoji">{CATEGORIES[o].emoji}</span>
              <b>{CATEGORIES[o].label}</b>
              <small>{CATEGORIES[o].examples}</small>
              <div className="vote-bar">
                <i style={{ height: `${(n / max) * 100}%` }} />
              </div>
              <span className="mono vote-n">{n}</span>
            </div>
          );
        })}
      </div>
      <div className="row center">
        <span className="chip">{ov.total} votos</span>
        <button
          className="btn big water"
          onClick={() => {
            const r = run({ type: 'objectVoteClose' });
            const data = r.data as { category: CategoryId } | undefined;
            if (r.ok && data) onWinner(data.category);
          }}
        >
          <Icon name="check" /> Cerrar votación
        </button>
      </div>
    </div>
  );
}

/* ---------------- elegir misión ---------------- */

function MissionPick({ view, run }: { view: HostView; run: Run }) {
  const done = new Set(view.colony.missions.map((m) => m.id));
  const [picked, setPicked] = useState<MissionId>(() => MISSION_ORDER.find((id) => !done.has(id)) ?? 'greenhouse');
  const snapshot = useHostSnapshot(view);
  const m = MISSIONS[picked];
  const locked = (id: MissionId) => id === 'final' && !view.finalUnlocked;
  return (
    <div className="mission-pick">
      <div className="mp-world" style={{ '--mc': m.color } as CSSProperties}>
        <PlanetView snapshot={snapshot} focus={MISSION_ZONE[picked]} autoRotate={false} className="stage-planet" />
        <div className="mp-world-tag">
          <span className="mono">{m.code}</span> {m.titleEs}
        </div>
        <div className="mp-crew" aria-hidden="true">
          <IXOrb size={96} mood="talk" />
          {ROLE_ORDER.map((r, i) => (
            <Astronaut key={r} avatar={ROLE_AVATARS[r]} role={r} size={86} pose={i % 2 ? 'wave' : 'idle'} />
          ))}
        </div>
      </div>
      <div className="mp-side">
        <div className="mp-list">
          {MISSION_ORDER.map((id) => {
            const mm = MISSIONS[id];
            const lock = locked(id);
            return (
              <button
                key={id}
                className={`mp ${picked === id ? 'on' : ''} ${lock ? 'locked' : ''}`}
                style={{ '--mc': mm.color } as CSSProperties}
                onClick={() => setPicked(id)}
              >
                <MissionPatch id={id} size={62} locked={lock} live={picked === id} />
                <span>
                  <b>{mm.title}</b>
                  <small>{mm.titleEs}</small>
                  {done.has(id) && <i className="mp-done">✓ completada</i>}
                </span>
              </button>
            );
          })}
        </div>
        <article className="mp-detail card" style={{ '--mc': m.color } as CSSProperties}>
          <p className="eyebrow dark">{m.code} · {m.learning.join(' · ')}</p>
          <h3>{m.title}</h3>
          <p>{m.hook}</p>
          <p className="fine">
            <b>Objetivo:</b> {m.objective}
          </p>
          {locked(picked) ? (
            <span className="chip dark">🔒 Completa 3 misiones distintas para desbloquearla</span>
          ) : (
            <button className="btn big food" onClick={() => run({ type: 'chooseMission', missionId: picked })}>
              Iniciar esta misión 🚀
            </button>
          )}
        </article>
      </div>
    </div>
  );
}

/* ---------------- revelación ---------------- */

const SOURCE_LABEL: Record<ScanResult['source'], string> = {
  ai: '✨ Claude · visión multimodal',
  local: '🧠 IA local en este dispositivo',
  manual: '🧑‍🏫 Confirmado por el profesor',
  vote: '🗳️ Votación de la clase',
  teacher: '🧑‍🏫 Elegida por el profesor',
};

function ScanReveal({ analysis, onStart, onReset, onFix }: { analysis: Analysis; onStart: (s: ScanResult) => void; onReset: () => void; onFix: (c: CategoryId) => void }) {
  const [lines, setLines] = useState(0);
  const steps = [
    '› Calibrando sensores ópticos…',
    '› Buscando patrones conocidos…',
    aiStatus().enabled ? '› Consultando a Claude (visión multimodal)…' : '› Analizando en este dispositivo…',
    '› Clasificando la categoría…',
    '› Consultando la biblioteca de misiones…',
  ];
  useEffect(() => {
    if (analysis.status !== 'analyzing') return;
    setLines(0);
    const id = setInterval(() => setLines((n) => Math.min(steps.length, n + 1)), 420);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.status]);
  useEffect(() => {
    if (analysis.status === 'done') sfx.unlock();
  }, [analysis.status]);

  const s = analysis.scan;
  const cat = s?.category ?? 'mystery';
  const missionId: MissionId | null = s ? (cat === 'mystery' ? null : CATEGORIES[cat].missionId) : null;

  return (
    <div className="reveal">
      <div className="reveal-scan card">
        <div className="reveal-head">
          <span className="eyebrow dark">Escáner IA de Don Rover</span>
          {s && <span className="chip dark">{SOURCE_LABEL[s.source]}</span>}
        </div>
        <div className="reveal-body">
          <div className={`reveal-photo ${analysis.status === 'analyzing' ? 'scanning' : ''}`}>
            {analysis.image ? <img src={analysis.image} alt="Objeto escaneado" /> : <span className="big-emoji">{CATEGORIES[cat].emoji}</span>}
            {analysis.status === 'analyzing' && <div className="scanbeam" />}
          </div>
          <div className="reveal-info">
            {analysis.status === 'analyzing' && (
              <div className="terminal mono">
                {steps.slice(0, lines).map((l) => (
                  <p key={l}>{l}</p>
                ))}
                <span className="caret">▍</span>
              </div>
            )}
            {analysis.status === 'done' && s && (
              <div className="found">
                <p className="eyebrow dark">Object discovered</p>
                <h2>
                  {CATEGORIES[cat].emoji} {s.label}
                </h2>
                <p className="found-meta">
                  Categoría: <b>{CATEGORIES[cat].label}</b> · confianza {Math.round(s.confidence * 100)}%
                </p>
                <blockquote>
                  <IXOrb size={40} mood="talk" /> «{s.discovery}»
                </blockquote>
                {s.funFact && <p className="fun">🛰️ {s.funFact}</p>}
              </div>
            )}
            {analysis.status === 'unknown' && (
              <div className="found">
                <p className="eyebrow dark">Objeto misterioso</p>
                <h2>IX no lo reconoció… ¿qué es?</h2>
                <p className="found-meta">Elige la categoría que mejor lo describe:</p>
              </div>
            )}
          </div>
        </div>
        {analysis.status !== 'analyzing' && (
          <div className="reveal-fix">
            <span>{analysis.status === 'done' ? '¿No es correcto?' : 'Categorías:'}</span>
            {[...SCAN_CATEGORIES, 'mystery' as CategoryId].map((c) => (
              <button key={c} className={`chip dark ${c === cat && analysis.status === 'done' ? 'ok' : ''}`} onClick={() => onFix(c)}>
                {CATEGORIES[c].emoji} {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {analysis.status === 'done' && s && (
        <div className="reveal-mission card">
          <p className="eyebrow dark">New mission unlocked</p>
          {missionId ? <MissionPatch id={missionId} size={140} live /> : <div className="mystery-patch">❔</div>}
          <h2>{missionId ? MISSIONS[missionId].title : 'MISIÓN SORPRESA'}</h2>
          <p>{missionId ? MISSIONS[missionId].titleEs : 'IX elegirá una misión que la colonia aún no ha jugado'}</p>
          <p className="fine">{CATEGORIES[cat].unlocks}</p>
          <button className="btn big food" onClick={() => onStart(s)}>
            Iniciar misión 🚀
          </button>
        </div>
      )}
      <button className="btn small ghost reveal-reset" onClick={onReset}>
        <Icon name="refresh" size={16} /> Escanear otro objeto
      </button>
    </div>
  );
}

/* ---------------- etapa ---------------- */

export function Scanner({ view, run, flash }: { view: HostView; run: Run; flash: (m: string) => void }) {
  const [mode, setMode] = useState<Mode>(() => (window.isSecureContext && navigator.mediaDevices ? 'camera' : 'vote'));
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const analyze = async (canvas: HTMLCanvasElement) => {
    const image = canvas.toDataURL('image/jpeg', 0.82);
    setAnalysis({ image, scan: null, status: 'analyzing' });
    const t0 = performance.now();
    let local: ReturnType<typeof categorize> = null;
    try {
      const d = await loadDetector();
      local = categorize(await d.detect(canvas, 8, 0.35), brightFraction(canvas));
    } catch {
      /* sin visión local */
    }
    let scan: ScanResult | null = aiStatus().enabled ? await classifyImage(image) : null;
    if (!scan && local) {
      scan = { ...local, discovery: CATEGORY_LINES[local.category].discovery, funFact: CATEGORY_LINES[local.category].funFact, source: 'local' };
    }
    const wait = 2300 - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
    setAnalysis({ image, scan, status: scan ? 'done' : 'unknown' });
  };

  const fix = (c: CategoryId) => {
    setAnalysis((a) =>
      a
        ? {
            ...a,
            status: 'done',
            scan: {
              category: c,
              label: a.scan && a.scan.category === c ? a.scan.label : CATEGORIES[c].label,
              confidence: 1,
              discovery: CATEGORY_LINES[c].discovery,
              funFact: CATEGORY_LINES[c].funFact,
              source: a.scan?.source === 'vote' ? 'vote' : 'manual',
            },
          }
        : a,
    );
  };

  if (analysis) {
    return (
      <ScanReveal
        analysis={analysis}
        onFix={fix}
        onReset={() => setAnalysis(null)}
        onStart={(s) => {
          const r = run({ type: 'chooseScan', scan: s });
          if (!r.ok && r.error) flash(r.error);
        }}
      />
    );
  }

  const tabs: { id: Mode; icon: string; label: string }[] = [
    { id: 'camera', icon: 'camera', label: 'Cámara' },
    { id: 'upload', icon: 'upload', label: 'Subir foto' },
    { id: 'vote', icon: 'vote', label: 'Votación de la clase' },
    { id: 'mission', icon: 'target', label: 'Elegir misión' },
  ];

  return (
    <div className="scanner">
      <div className="stage-head">
        <p className="eyebrow">World scanner</p>
        <h2 className="sticker">Scan the world</h2>
        <p>Fotografía un objeto del salón: IX identifica su categoría y desbloquea una misión científica para toda la clase.</p>
      </div>
      <div className="scan-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={mode === t.id} className={`scan-tab ${mode === t.id ? 'on' : ''}`} onClick={() => setMode(t.id)}>
            <Icon name={t.icon} size={18} /> {t.label}
          </button>
        ))}
      </div>
      <div className="scan-body">
        {mode === 'camera' && <CameraScan onCapture={analyze} />}
        {mode === 'upload' && <UploadScan onImage={analyze} />}
        {mode === 'vote' && (
          <VoteScan
            view={view}
            run={run}
            onWinner={(c) =>
              setAnalysis({
                image: null,
                status: 'done',
                scan: { category: c, label: CATEGORIES[c].label, confidence: 1, discovery: CATEGORY_LINES[c].discovery, funFact: CATEGORY_LINES[c].funFact, source: 'vote' },
              })
            }
          />
        )}
        {mode === 'mission' && <MissionPick view={view} run={run} />}
      </div>
    </div>
  );
}
