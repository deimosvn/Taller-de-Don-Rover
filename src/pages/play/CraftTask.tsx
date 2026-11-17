// Fabricar la pieza de la misión: la receta, lo que ya hay en la mochila y el botón para
// imprimirla en 3D en la estación. En celulares sin 3D se mina aquí mismo, en un campo de
// rocas, para que nadie se quede sin jugar.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MINERALS, MINERAL_ORDER, MINE_YIELD, RECIPES, canCraft, nextMineral, type MineralId } from '../../../shared/crafting';
import type { PlayerView } from '../../../shared/types';
import { vibrate } from '../../lib/pwa';
import { sfx } from '../../lib/sound';
import type { PlayerNet } from '../../net/playerNet';
import { addMineral, bagKey, craft, useBag } from './bag';

/** Campo de rocas para minar desde la tarjeta (celulares sin 3D). */
function MineField({ minerals, onMined }: { minerals: MineralId[]; onMined: (m: MineralId) => void }) {
  const make = () => Array.from({ length: 6 }, (_, i) => ({ id: i, m: minerals[i % minerals.length], hp: 3, regrow: 0 }));
  const [rocks, setRocks] = useState(make);
  useEffect(() => {
    const id = setInterval(() => setRocks((rs) => rs.map((r) => (r.hp <= 0 && Date.now() > r.regrow ? { ...r, hp: 3 } : r))), 500);
    return () => clearInterval(id);
  }, []);
  const hit = (i: number) => {
    const r = rocks[i];
    if (r.hp <= 0) return;
    sfx.mine();
    vibrate(10);
    const hp = r.hp - 1;
    setRocks((rs) => rs.map((x, k) => (k === i ? { ...x, hp, regrow: hp <= 0 ? Date.now() + 3500 : 0 } : x)));
    if (hp <= 0) onMined(r.m);
  };
  return (
    <div className="craft-field" aria-label="Rocas para minar">
      {rocks.map((r, i) => (
        <button key={r.id} className={`craft-rock hp-${Math.max(0, r.hp)}`} style={{ '--c': MINERALS[r.m].color } as CSSProperties} onClick={() => hit(i)} disabled={r.hp <= 0} aria-label={`Minar ${MINERALS[r.m].name}`}>
          <span aria-hidden="true">{r.hp > 0 ? MINERALS[r.m].emoji : '·'}</span>
          {r.hp > 0 && <small>{'●'.repeat(r.hp)}</small>}
        </button>
      ))}
    </div>
  );
}

export function CraftPanel({ view, net, atStation, mineHere }: { view: PlayerView; net: PlayerNet | null; atStation: boolean; mineHere: boolean }) {
  const t = view.task!;
  const m = view.mission!;
  const recipe = RECIPES[m.id][t.role];
  const key = bagKey(m.id, t.role);
  const st = useBag(key, t.points, recipe);
  const [printing, setPrinting] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  const ready = canCraft(recipe, st.bag);
  const needs = MINERAL_ORDER.filter((x) => recipe.needs[x]);
  const next = nextMineral(recipe, st.bag);

  const mined = (x: MineralId) => {
    const n = MINE_YIELD[x];
    const pts = addMineral(key, recipe, x, n);
    if (pts) net?.sendTask(pts);
    sfx.pickup();
  };

  const startCraft = () => {
    if (!ready || printing) return;
    sfx.select();
    let p = 0;
    timer.current = setInterval(() => {
      p += 0.05;
      sfx.print();
      setPrinting(Math.min(1, p));
      if (p >= 1) {
        clearInterval(timer.current!);
        timer.current = null;
        const pts = craft(key, recipe);
        if (pts) net?.sendTask(pts);
        sfx.crafted();
        vibrate([60, 40, 120]);
        setPrinting(0);
      }
    }, 110);
  };

  return (
    <div className="craft">
      <div className="craft-head">
        <span className={`craft-item ${st.crafted ? 'is-done' : ''}`} aria-hidden="true">
          {recipe.emoji}
        </span>
        <div>
          <small>{st.crafted ? 'Pieza fabricada' : 'Pieza por fabricar'}</small>
          <b>{recipe.item}</b>
        </div>
      </div>
      {!st.crafted && (
        <ul className="craft-needs">
          {needs.map((x) => {
            const need = recipe.needs[x] ?? 0;
            const have = Math.min(need, st.bag[x]);
            return (
              <li key={x} className={have >= need ? 'is-full' : x === next ? 'is-next' : ''} style={{ '--c': MINERALS[x].color } as CSSProperties}>
                <span aria-hidden="true">{MINERALS[x].emoji}</span>
                <span className="craft-name">{MINERALS[x].name}</span>
                <span className="craft-bar">
                  <i style={{ width: `${(have / need) * 100}%` }} />
                </span>
                <b>
                  {have}/{need}
                </b>
              </li>
            );
          })}
        </ul>
      )}
      <p className="craft-how">🔬 {recipe.how}</p>
      {st.crafted ? (
        <p className="craft-done">
          ✅ ¡Listo! Tu {recipe.item.toLowerCase()} ya está en la colonia.
          {t.progress < 1 && t.link ? ` Funcionará al 100 % cuando ${t.link.name} termine su parte.` : ''}
        </p>
      ) : printing > 0 ? (
        <div className="craft-print" role="progressbar" aria-valuenow={Math.round(printing * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Imprimiendo en 3D">
          <span>🖨️ Imprimiendo en 3D con recursos de Marte…</span>
          <i style={{ width: `${printing * 100}%` }} />
        </div>
      ) : atStation ? (
        <button className="btn mars block craft-btn" disabled={!ready} onClick={startCraft}>
          {ready ? `🛠️ Fabricar ${recipe.item}` : `⛏️ Faltan minerales: ${next ? MINERALS[next].name.toLowerCase() : ''}`}
        </button>
      ) : (
        <p className="craft-tip">
          {ready
            ? `📍 ¡Ya tienes todo! Ve a tu estación (${t.place}) para fabricar la pieza.`
            : `⛏️ Busca ${next ? `${MINERALS[next].emoji} ${MINERALS[next].name.toLowerCase()}: ${MINERALS[next].where}` : 'minerales'}. Acércate y toca «Minar».`}
        </p>
      )}
      {mineHere && !st.crafted && <MineField minerals={needs} onMined={mined} />}
    </div>
  );
}
