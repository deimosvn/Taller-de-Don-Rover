// Problemas de la emergencia global y los minijuegos para repararlos.
//
// Durante la emergencia aparecen problemas por toda la colonia 3D (paneles con polvo, fugas,
// grietas, cultivos marchitos…). Cada uno lo repara una especialidad: el alumno camina hasta
// él con su astronauta, lo revisa y juega un minijuego. Lo bien que lo juegue se convierte en
// "acciones" para el motor, así que las reglas, la meta y el balance del juego no cambian.
//
//   sweep ..... manejar a Don Rover sobre los paneles para barrer el polvo
//   pipes ..... girar piezas de tubería (o de cable) hasta que el flujo llegue al otro lado
//   garden .... darle a cada planta lo que pide (agua, luz o un domo contra el polvo)
//   weld ...... recorrer una grieta con el dedo para soldarla
//   balance ... repartir la energía para que cada sistema quede en su zona verde
//   catch ..... atrapar lo bueno (hielo, datos) y esquivar lo malo (sales, ruido)
//   sort ...... mandar cada muestra a su lado (agua limpia o contaminada, señal o ruido)
//   rhythm .... tocar al ritmo de una máquina (generador de oxígeno, radiador, bomba)
//   stack ..... apilar capas bien alineadas (muro aislante, impresora 3D, escudo)
//   tune ...... igualar tu onda con la señal (orientar el plato de la antena)
//
// Los datos científicos están aquí, en un solo lugar.

import type { IncidentKind, MissionId, RoleId } from './types';

export type MinigameKind = 'sweep' | 'pipes' | 'garden' | 'weld' | 'balance' | 'catch' | 'sort' | 'rhythm' | 'stack' | 'tune';

export interface MinigameSpec {
  kind: MinigameKind;
  /** Variante visual y de textos dentro del tipo de juego. */
  theme: string;
  /** El problema que se ve en el mundo 3D. */
  incident: IncidentKind;
  /** Nombre corto del problema ("Paneles cubiertos de polvo"). */
  problem: string;
  /** Instrucción corta y concreta (qué hacer con el dedo). */
  how: string;
  /** Dato real relacionado. */
  science: string;
  /** De dónde viene el dato. */
  source: string;
}

const spec = (kind: MinigameKind, theme: string, incident: IncidentKind, problem: string, how: string, science: string, source: string): MinigameSpec => ({
  kind,
  theme,
  incident,
  problem,
  how,
  science,
  source,
});

const DUST = 'Las tormentas de polvo de Marte pueden cubrir todo el planeta durante semanas y tapar la luz del Sol.';
const ROVERS = 'Los rovers Spirit y Opportunity perdían energía por el polvo en sus paneles; a veces el viento marciano los limpiaba solo.';
const WATER = 'En la Estación Espacial Internacional se recupera cerca del 98 % del agua: cada gota se vuelve a usar.';
const LEAK = 'En 2020, los astronautas de la Estación Espacial encontraron una fuga de aire viendo hacia dónde flotaban unas hojitas de té.';
const VEGGIE = 'Las plantas en el espacio crecen con luces LED rojas y azules: son los colores que más usan para la fotosíntesis.';
const POWER = 'La Estación Espacial reparte la energía de sus paneles solares entre todos sus módulos con una red de cables y baterías.';

export const MINIGAMES: Record<MissionId, Record<RoleId, MinigameSpec>> = {
  greenhouse: {
    power: spec('sweep', 'panels', 'dust', 'Paneles cubiertos de polvo', 'Arrastra a Don Rover sobre los paneles para barrer el polvo antes de que vuelva el viento.', ROVERS, 'NASA · Mars Exploration Rovers'),
    life: spec('pipes', 'water', 'leak', 'Riego sin agua', 'Toca las piezas para girarlas hasta que el agua llegue del tanque a los cultivos.', WATER, 'NASA · Soporte vital de la EEI'),
    bio: spec('garden', 'storm', 'wilt', 'Brotes en peligro', 'Elige la herramienta que pide cada brote (agua, luz o domo) y tócalo.', DUST, 'NASA · Tormentas de polvo en Marte'),
    habitat: spec('weld', 'hatch', 'crack', 'Compuerta con fuga', 'Recorre la grieta con el dedo, de punta a punta, para soldarla.', 'Los hábitats espaciales mantienen dentro una presión de aire parecida a la del nivel del mar en la Tierra.', 'NASA · Estación Espacial Internacional'),
  },
  water: {
    power: spec('balance', 'pumps', 'overload', 'Bombas sin energía', 'Sube o baja cada barra para que las tres bombas queden en su zona verde aunque la demanda cambie.', 'Derretir hielo y bombear agua necesita energía: en una base espacial el agua y la energía están conectadas.', 'NASA · Recursos en Marte'),
    life: spec('catch', 'ice', 'leak', 'Reserva de agua vacía', 'Mueve el tanque para atrapar bloques de hielo y esquivar las rocas con sales.', 'En Marte hay hielo en los polos y enterrado bajo el suelo; la sonda Phoenix lo encontró a pocos centímetros en 2008.', 'NASA · Phoenix Mars Lander'),
    bio: spec('sort', 'water', 'wilt', 'Agua con percloratos', 'Desliza cada gota hacia el lado correcto: limpia al tanque, con sales al filtro.', 'La sonda Phoenix encontró percloratos en el suelo marciano: hay que quitarlos antes de beber o regar.', 'NASA · Phoenix Mars Lander'),
    habitat: spec('pipes', 'patch', 'crack', 'Tubería rota', 'Gira las piezas de tubería hasta cerrar el circuito y que el agua deje de escaparse.', WATER, 'NASA · Soporte vital de la EEI'),
  },
  darkness: {
    power: spec('balance', 'priorities', 'overload', 'Red eléctrica sobrecargada', 'Reparte la poca energía: cada sistema debe quedar en su zona verde. El soporte vital nunca se apaga.', 'Marte recibe menos de la mitad de la luz solar que la Tierra, por eso cada rayo cuenta.', 'NASA · Datos de Marte'),
    life: spec('rhythm', 'scrubber', 'overload', 'Aire con mucho CO₂', 'Toca justo cuando el anillo llegue al círculo para que el generador limpie el aire.', 'En la Estación Espacial, una máquina retira el dióxido de carbono que exhalan los astronautas para que el aire sea seguro.', 'NASA · Soporte vital de la EEI'),
    bio: spec('garden', 'led', 'wilt', 'Cultivos a oscuras', 'Elige la herramienta que pide cada bandeja (agua, luz LED o abono) y tócala.', VEGGIE, 'NASA · Experimento Veggie'),
    habitat: spec('stack', 'insulation', 'cold', 'Muros perdiendo calor', 'Toca para soltar cada bloque aislante justo encima del anterior.', 'La temperatura promedio en Marte es de unos −60 °C: un hábitat sin aislamiento perdería su calor muy rápido.', 'NASA · Datos de Marte'),
  },
  signal: {
    power: spec('catch', 'data', 'static', 'Datos perdidos', 'Mueve la antena para atrapar los paquetes de datos y esquivar el ruido.', 'Las naves en Marte se comunican con la Tierra mediante la Red del Espacio Profundo de la NASA.', 'NASA · Deep Space Network'),
    life: spec('rhythm', 'radiator', 'overload', 'Transmisor sobrecalentado', 'Toca justo cuando el anillo llegue al círculo para soltar el calor por el radiador.', 'Las naves usan radiadores para soltar al espacio el calor que les sobra.', 'NASA · Control térmico de la EEI'),
    bio: spec('sort', 'signal', 'static', 'Señal con ruido', 'Desliza cada pulso: los que siguen el patrón a la señal, los demás al ruido.', 'Un mensaje de radio tarda entre 3 y 22 minutos en viajar entre la Tierra y Marte.', 'NASA · Comunicaciones con Marte'),
    habitat: spec('tune', 'dish', 'static', 'Antena desorientada', 'Arrastra para cambiar tu onda (frecuencia y altura) hasta que coincida con la señal.', 'La Red del Espacio Profundo de la NASA usa antenas de hasta 70 metros para escuchar a las naves que están en Marte.', 'NASA · Deep Space Network'),
  },
  habitat: {
    power: spec('pipes', 'cables', 'overload', 'Módulo sin corriente', 'Gira las piezas de cable hasta que la energía llegue de la batería al módulo.', POWER, 'NASA · Sistema eléctrico de la EEI'),
    life: spec('rhythm', 'pressure', 'leak', 'Módulo sin presión', 'Toca justo cuando el anillo llegue al círculo para bombear aire al módulo.', 'La Estación Espacial mantiene su aire a unos 101 kPa, casi la misma presión que al nivel del mar en la Tierra.', 'NASA · Estación Espacial Internacional'),
    bio: spec('garden', 'move', 'wilt', 'Cultivos por mudar', 'Elige la herramienta que pide cada maceta antes de mudarla y tócala.', 'En la Estación Espacial ya se han cultivado lechugas, flores de zinnia y chiles.', 'NASA · Experimento Veggie'),
    habitat: spec('stack', 'printer', 'crack', 'Módulo sin terminar', 'Toca para que la impresora suelte cada capa de regolito justo encima de la anterior.', 'La NASA ha probado hábitats impresos en 3D, como Mars Dune Alpha en Houston.', 'NASA · CHAPEA / Mars Dune Alpha'),
  },
  final: {
    power: spec('balance', 'grid', 'overload', 'Red de la colonia inestable', 'Reparte la energía: cada sector debe quedar en su zona verde aunque la demanda cambie.', POWER, 'NASA · Sistema eléctrico de la EEI'),
    life: spec('weld', 'airleak', 'leak', 'Fuga de aire', 'Recorre la grieta con el dedo para sellarla antes de que baje la presión.', LEAK, 'NASA · Estación Espacial Internacional'),
    bio: spec('garden', 'storm', 'wilt', 'Cultivos en peligro', 'Elige la herramienta que pide cada cultivo (agua, luz o domo) y tócalo.', DUST, 'NASA · Tormentas de polvo en Marte'),
    habitat: spec('stack', 'shield', 'crack', 'Escudo agrietado', 'Toca para soltar cada bloque de regolito justo encima del anterior.', 'Una capa de regolito (suelo marciano) sobre los refugios ayuda a proteger a los astronautas de la radiación.', 'NASA · Hábitats en Marte'),
  },
};

export function minigameFor(mission: MissionId | null | undefined, role: RoleId | null | undefined): MinigameSpec {
  return MINIGAMES[mission ?? 'greenhouse']?.[role ?? 'power'] ?? MINIGAMES.greenhouse.power;
}

/** Puntos que necesita un problema para quedar reparado (≈ 15–20 s de buen juego). */
export const INCIDENT_POINTS = 30;
