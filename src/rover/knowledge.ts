// Lo que Don Rover sabe sin IA ni internet: respuestas cortas para niñas y niños, escritas con
// los mismos datos reales del juego (shared/marsSim.ts). La usan la consola (assistant.ts) y la
// portada, que muestra ejemplos de qué preguntarle sin cargar la voz ni la conexión con la placa.

import { HUMAN, MARS, MOXIE, RADIATION } from '../../shared/marsSim';

export interface KnowledgeEntry {
  keys: string[];
  answer: string;
  face: 'happy' | 'wow' | 'think' | 'neutral';
}

const n = (x: number) => x.toLocaleString('es-MX');

export const KB: KnowledgeEntry[] = [
  {
    keys: ['quien eres', 'como te llamas', 'que eres', 'don rover'],
    answer: 'Soy Don Rover, el rover del taller. Recorro la colonia, cuido sus sistemas y ayudo a la tripulación a aprender cómo se vive en Marte. Pregúntame lo que quieras sobre el planeta rojo.',
    face: 'happy',
  },
  {
    keys: ['radiacion', 'rayos cosmicos', 'blindaje', 'escudo', 'sievert', 'tormenta solar'],
    answer: `En Marte no hay un campo magnético ni un aire grueso que nos proteja del Sol y de los rayos cósmicos. El rover Curiosity midió ${RADIATION.surface} milisieverts por día: unas doscientas treinta veces más que en la Tierra. Por eso los hábitats se cubren con una capa de suelo marciano, como una cobija muy gruesa.`,
    face: 'think',
  },
  {
    // "respir" reconoce respirar, respiran, respiramos…
    keys: ['oxigeno', 'respir', 'aire', 'moxie', 'dioxido de carbono'],
    answer: `El aire de Marte es casi todo dióxido de carbono. El experimento MOXIE del rover Perseverance logró separar oxígeno de ese aire: unos ${MOXIE.gramsPerHour} gramos por hora. Cada astronauta necesita como ${n(HUMAN.o2)} kilos de oxígeno al día, así que una colonia necesitaría máquinas mucho más grandes.`,
    face: 'wow',
  },
  {
    keys: ['agua', 'hielo', 'beber', 'reciclar'],
    answer: `En Marte hay hielo bajo el suelo y en los polos. La sonda Phoenix lo encontró a cinco centímetros de profundidad. Una persona usa unos ${HUMAN.water} litros de agua al día, y en la Estación Espacial se recicla casi toda, ¡hasta el sudor!`,
    face: 'wow',
  },
  {
    keys: ['tormenta de polvo', 'polvo', 'paneles', 'energia', 'solar', 'electricidad'],
    answer: `A Marte llega menos de la mitad de la luz del Sol que a la Tierra. Cuando hay una tormenta de polvo el cielo se oscurece y los paneles casi no producen. En 2018 una tormenta enorme dejó sin energía al rover Opportunity. Por eso una base necesita baterías y ahorrar energía.`,
    face: 'think',
  },
  {
    keys: ['gravedad', 'pesar', 'saltar', 'peso'],
    answer: `La gravedad de Marte es como un tercio de la de la Tierra: ${MARS.g} metros por segundo cada segundo. Si pesas treinta kilos en la Tierra, en Marte sentirías como si pesaras once. ¡Podrías saltar casi tres veces más alto!`,
    face: 'happy',
  },
  {
    keys: ['sol marciano', 'cuanto dura un dia', 'dia en marte', 'que es un sol'],
    answer: 'Un día en Marte se llama sol y dura veinticuatro horas con treinta y nueve minutos, casi como en la Tierra. Pero un año marciano dura seiscientos ochenta y siete días terrestres: ¡casi el doble!',
    face: 'wow',
  },
  {
    keys: ['temperatura', 'frio', 'calor', 'clima'],
    answer: `Marte es muy frío: en promedio está a ${Math.abs(MARS.meanTemp)} grados bajo cero. En un día de verano cerca del ecuador puede llegar a unos veinte grados al mediodía, pero en la noche baja a menos ochenta.`,
    face: 'think',
  },
  {
    keys: ['planta', 'cultivo', 'invernadero', 'comida', 'comer', 'papa'],
    answer: 'Para comer en Marte hay que cultivar en invernaderos con luz, agua y nutrientes. La NASA probó papa, trigo, soya y lechuga en cámaras cerradas. Las plantas además limpian el aire: convierten el dióxido de carbono en oxígeno.',
    face: 'happy',
  },
  {
    keys: ['senal', 'comunicacion', 'tierra', 'mensaje', 'radio', 'antena'],
    answer: 'Una señal de radio tarda entre tres y veintidós minutos en llegar de Marte a la Tierra, según dónde estén los planetas. Por eso los astronautas tienen que resolver muchos problemas solos, sin esperar instrucciones.',
    face: 'think',
  },
  {
    keys: ['aterrizar', 'aterrizaje', 'paracaidas', 'cohete', 'llegar a marte', 'viaje'],
    answer: 'Llegar a Marte toma unos siete meses. Aterrizar es lo más difícil: la atmósfera es tan delgada que el paracaídas no basta, y la nave usa retrocohetes en los últimos segundos. A eso le dicen los siete minutos de terror.',
    face: 'wow',
  },
  {
    keys: ['distancia', 'que tan lejos', 'lejos esta'],
    answer: `Marte está entre ${n(MARS.earthMin)} y ${n(MARS.earthMax)} millones de kilómetros de la Tierra, porque los dos planetas giran alrededor del Sol a distinta velocidad. Por eso solo se puede viajar cada veintiséis meses, cuando quedan más cerca.`,
    face: 'wow',
  },
  {
    keys: ['rojo', 'color', 'oxido'],
    answer: 'Marte se ve rojo porque su suelo tiene mucho óxido de hierro, que es como la herrumbre de un clavo viejo. El polvo rojizo flota en el aire y por eso el cielo de día se ve color durazno.',
    face: 'happy',
  },
  {
    keys: ['volcan', 'olimpo', 'montana'],
    answer: 'En Marte está el Monte Olimpo, el volcán más grande del sistema solar. Mide casi veintidós kilómetros de alto, tres veces más que el Everest, y es tan ancho como todo México de norte a sur… bueno, ¡casi!',
    face: 'wow',
  },
  {
    keys: ['luna', 'lunas', 'fobos', 'deimos'],
    answer: 'Marte tiene dos lunas pequeñitas con forma de papa: Fobos y Deimos. Fobos se acerca a Marte poco a poco y dentro de muchos millones de años se romperá en pedazos.',
    face: 'wow',
  },
  {
    keys: ['rover', 'perseverance', 'curiosity', 'opportunity', 'ingenuity', 'helicoptero'],
    answer: 'La NASA tiene rovers trabajando en Marte. Curiosity llegó en 2012 y Perseverance en 2021, con un pequeño helicóptero llamado Ingenuity que voló más de setenta veces. ¡Son mis primos lejanos!',
    face: 'happy',
  },
  {
    keys: ['ix', 'inteligencia artificial', 'ia'],
    answer: 'IX es la inteligencia artificial de la colonia. Arma las misiones con datos reales de la NASA y da pistas cuando la tripulación se atora. Pero las decisiones las toman ustedes: IX narra y el motor del juego calcula qué pasa.',
    face: 'neutral',
  },
];

export const normalizeQuestion = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** La entrada que mejor responde una pregunta (o null si no sabe de qué se trata). */
export function matchKnowledge(question: string): KnowledgeEntry | null {
  const q = normalizeQuestion(question);
  let best: KnowledgeEntry | null = null;
  let bestScore = 0;
  for (const e of KB) {
    const score = e.keys.reduce((acc, k) => acc + (q.includes(k) ? k.length : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/** Lo que contesta cuando no sabe: invita a investigar y propone temas que sí conoce. */
export const UNKNOWN_ANSWER =
  'Mmm, esa no me la sé todavía. Pregúntale a tu profe o investiguen juntos en la página de la NASA. ¿Quieres saber algo sobre el agua, el aire, la radiación o la energía en Marte?';
