import type { CSSProperties } from 'react';
import { ACCESSORIES, HELMETS, SUIT_COLORS, SUIT_NAMES, VISORS, VISOR_NAMES } from '../../../shared/content';
import type { AvatarConfig } from '../../../shared/types';
import { Astronaut } from '../../components/art';
import { Icon } from '../../components/ui';
import { sfx } from '../../lib/sound';

export function AvatarBuilder({ value, onChange }: { value: AvatarConfig; onChange: (a: AvatarConfig) => void }) {
  const set = (patch: Partial<AvatarConfig>) => {
    sfx.select();
    onChange({ ...value, ...patch });
  };
  return (
    <div className="avatar-builder">
      <div className="ab-preview">
        <div className="ab-platform" />
        <Astronaut avatar={value} size={150} pose="cheer" draggable />
        <button
          className="ab-dice"
          aria-label="Astronauta al azar"
          onClick={() =>
            set({
              suit: Math.floor(Math.random() * SUIT_COLORS.length),
              helmet: Math.floor(Math.random() * HELMETS.length),
              visor: Math.floor(Math.random() * VISORS.length),
              accessory: Math.floor(Math.random() * ACCESSORIES.length),
            })
          }
        >
          <Icon name="dice" size={22} />
        </button>
      </div>

      <div className="ab-row">
        <span className="label">Traje</span>
        <div className="swatches">
          {SUIT_COLORS.map((c, i) => (
            <button key={c} className={`swatch ${value.suit === i ? 'on' : ''}`} style={{ '--c': c } as CSSProperties} aria-label={SUIT_NAMES[i]} onClick={() => set({ suit: i })} />
          ))}
        </div>
      </div>

      <div className="ab-row">
        <span className="label">Casco</span>
        <div className="ab-options">
          {HELMETS.map((h, i) => (
            <button key={h} className={`ab-opt ${value.helmet === i ? 'on' : ''}`} onClick={() => set({ helmet: i })}>
              <span className="ab-mini">
                <Astronaut avatar={{ ...value, helmet: i, accessory: 0 }} size={44} pose="still" />
              </span>
              <small>{h}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="ab-row">
        <span className="label">Visor</span>
        <div className="swatches">
          {VISORS.map((c, i) => (
            <button key={c} className={`swatch ${value.visor === i ? 'on' : ''}`} style={{ '--c': c } as CSSProperties} aria-label={VISOR_NAMES[i]} onClick={() => set({ visor: i })} />
          ))}
        </div>
      </div>

      <div className="ab-row">
        <span className="label">Accesorio</span>
        <div className="ab-options">
          {ACCESSORIES.map((a, i) => (
            <button key={a} className={`ab-opt ${value.accessory === i ? 'on' : ''}`} onClick={() => set({ accessory: i })}>
              <span className="ab-mini">
                <Astronaut avatar={{ ...value, accessory: i }} size={44} pose="still" />
              </span>
              <small>{a}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
