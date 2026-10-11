import type { ItemDef } from "./types";

/**
 * Banco de preguntas de INGLES (compartido por EE. UU. y Reino Unido; solo cambia
 * la voz de los audios). La primera opcion es la correcta: el motor las baraja.
 */
export const EN_ITEMS: ItemDef[] = [
  // ---------------- A1 ----------------
  { id: "en-a1-01", skill: "GRAMMAR", level: "A1", stem: "She ___ a teacher.", options: ["is", "are", "am", "be"] },
  { id: "en-a1-02", skill: "GRAMMAR", level: "A1", stem: "I ___ coffee every morning.", options: ["drink", "drinks", "drinking", "am drink"] },
  { id: "en-a1-03", skill: "VOCAB", level: "A1", stem: "The opposite of “big” is ___.", options: ["small", "tall", "long", "old"] },
  { id: "en-a1-04", skill: "GRAMMAR", level: "A1", stem: "There ___ two books on the table.", options: ["are", "is", "be", "has"] },
  { id: "en-a1-05", skill: "GRAMMAR", level: "A1", stem: "___ you like pizza?", options: ["Do", "Does", "Are", "Is"] },
  { id: "en-a1-06", skill: "VOCAB", level: "A1", stem: "My mother's brother is my ___.", options: ["uncle", "cousin", "nephew", "grandfather"] },
  { id: "en-a1-07", skill: "VOCAB", level: "A1", stem: "I'm hungry. Let's ___ something.", options: ["eat", "drink", "sleep", "wear"] },
  {
    id: "en-a1-08",
    skill: "READING",
    level: "A1",
    passage: "Hi! I'm Tom. I live in London with my sister. We have a small dog called Max.",
    stem: "¿Con quién vive Tom?",
    options: ["Con su hermana", "Con su hermano", "Con sus padres", "Solo"],
  },
  {
    id: "en-a1-09",
    skill: "LISTENING",
    level: "A1",
    audioText: "Hello, my name is Sarah and I am twenty-five years old.",
    stem: "¿Cuántos años tiene Sarah?",
    options: ["25", "35", "20", "52"],
  },
  {
    id: "en-a1-10",
    skill: "LISTENING",
    level: "A1",
    audioText: "The bus leaves at half past seven.",
    stem: "¿A qué hora sale el bus?",
    options: ["7:30", "7:15", "6:30", "8:30"],
  },

  // ---------------- A2 ----------------
  { id: "en-a2-01", skill: "GRAMMAR", level: "A2", stem: "Yesterday I ___ to the cinema.", options: ["went", "go", "gone", "going"] },
  { id: "en-a2-02", skill: "GRAMMAR", level: "A2", stem: "He is ___ than his brother.", options: ["taller", "tallest", "more tall", "tall"] },
  { id: "en-a2-03", skill: "GRAMMAR", level: "A2", stem: "I have lived here ___ 2019.", options: ["since", "for", "from", "during"] },
  { id: "en-a2-04", skill: "VOCAB", level: "A2", stem: "Can you ___ me the salt, please?", options: ["pass", "give up", "take", "bring up"] },
  { id: "en-a2-05", skill: "GRAMMAR", level: "A2", stem: "We ___ dinner when the phone rang.", options: ["were having", "have", "had", "are having"] },
  { id: "en-a2-06", skill: "VOCAB", level: "A2", stem: "I'm really ___ in learning German.", options: ["interested", "interesting", "interest", "interests"] },
  { id: "en-a2-07", skill: "GRAMMAR", level: "A2", stem: "You ___ smoke in the hospital. It's forbidden.", options: ["mustn't", "don't have to", "needn't", "aren't"] },
  {
    id: "en-a2-08",
    skill: "READING",
    level: "A2",
    passage:
      "Dear Laura, I'm sorry I can't come to your party on Saturday. My grandmother is ill and I'm visiting her in Leeds. Have fun! — Jake",
    stem: "¿Por qué Jake no va a la fiesta?",
    options: ["Visita a su abuela enferma", "Tiene que trabajar", "Está enfermo", "Se va de vacaciones"],
  },
  {
    id: "en-a2-09",
    skill: "LISTENING",
    level: "A2",
    audioText: "Excuse me, is there a pharmacy near here? Yes, go straight on and turn left at the bank.",
    stem: "¿Dónde hay que girar a la izquierda?",
    options: ["En el banco", "En la farmacia", "En el semáforo", "En la estación"],
  },
  {
    id: "en-a2-10",
    skill: "LISTENING",
    level: "A2",
    audioText: "I'd like a large cappuccino and a cheese sandwich, please. To take away.",
    stem: "¿Qué pide la persona?",
    options: [
      "Un capuchino grande y un sándwich de queso, para llevar",
      "Un té y un pastel, para tomar allí",
      "Un café pequeño y un sándwich de jamón",
      "Un capuchino pequeño, para tomar allí",
    ],
  },

  // ---------------- B1 ----------------
  { id: "en-b1-01", skill: "GRAMMAR", level: "B1", stem: "If I ___ more time, I would travel more.", options: ["had", "have", "would have", "will have"] },
  { id: "en-b1-02", skill: "GRAMMAR", level: "B1", stem: "The museum ___ in 1890.", options: ["was built", "built", "has built", "is building"] },
  { id: "en-b1-03", skill: "GRAMMAR", level: "B1", stem: "She asked me where I ___.", options: ["lived", "live", "am living", "do live"] },
  { id: "en-b1-04", skill: "VOCAB", level: "B1", stem: "I need to ___ a decision by Friday.", options: ["make", "do", "take out", "get"] },
  { id: "en-b1-05", skill: "GRAMMAR", level: "B1", stem: "I'm not used to ___ up so early.", options: ["getting", "get", "got", "have got"] },
  {
    id: "en-b1-06",
    skill: "GRAMMAR",
    level: "B1",
    stem: "By the time we arrived, the film ___.",
    options: ["had already started", "already started", "has already started", "already starts"],
  },
  { id: "en-b1-07", skill: "VOCAB", level: "B1", stem: "Could you ___ the music down? I'm trying to study.", options: ["turn", "put", "take", "set"] },
  {
    id: "en-b1-08",
    skill: "READING",
    level: "B1",
    passage:
      "More companies now allow employees to work from home two or three days a week. Workers say they save time on commuting, but some miss chatting with colleagues.",
    stem: "Según el texto, ¿qué extrañan algunos trabajadores?",
    options: ["Conversar con sus compañeros", "El tiempo de viaje", "Trabajar cinco días en la oficina", "Su salario anterior"],
  },
  {
    id: "en-b1-09",
    skill: "LISTENING",
    level: "B1",
    audioText:
      "Due to engineering works, the nine fifteen train to Manchester will depart from platform six instead of platform two.",
    stem: "¿Qué cambió?",
    options: ["El andén", "La hora de salida", "El destino", "El precio"],
  },
  {
    id: "en-b1-10",
    skill: "LISTENING",
    level: "B1",
    audioText: "I would have called you, but my phone ran out of battery.",
    stem: "¿Por qué no llamó?",
    options: ["Se le acabó la batería", "No tenía su número", "Estaba ocupado", "Perdió el teléfono"],
  },

  // ---------------- B2 ----------------
  { id: "en-b2-01", skill: "GRAMMAR", level: "B2", stem: "I wish I ___ to the party last night.", options: ["had gone", "went", "would go", "have gone"] },
  { id: "en-b2-02", skill: "GRAMMAR", level: "B2", stem: "Hardly ___ the house when it started to rain.", options: ["had I left", "I had left", "I left", "did I leave"] },
  { id: "en-b2-03", skill: "VOCAB", level: "B2", stem: "The negotiations ___ down after three hours.", options: ["broke", "fell", "came", "ran"] },
  { id: "en-b2-04", skill: "GRAMMAR", level: "B2", stem: "She denied ___ the documents.", options: ["taking", "to take", "take", "that take"] },
  { id: "en-b2-05", skill: "VOCAB", level: "B2", stem: "His argument doesn't hold ___; there's no evidence.", options: ["water", "air", "ground", "weight"] },
  { id: "en-b2-06", skill: "GRAMMAR", level: "B2", stem: "The report needs ___ before Monday.", options: ["finishing", "to finishing", "finish", "being finish"] },
  { id: "en-b2-07", skill: "VOCAB", level: "B2", stem: "We need to ___ the risks against the benefits.", options: ["weigh", "balance up", "measure out", "count"] },
  {
    id: "en-b2-08",
    skill: "READING",
    level: "B2",
    passage:
      "Although the new policy was intended to reduce traffic, critics argue that it has merely shifted congestion to neighbouring districts rather than solving the problem.",
    stem: "¿Qué opinan los críticos?",
    options: [
      "Que solo trasladó el problema a otras zonas",
      "Que redujo el tráfico en toda la ciudad",
      "Que la política aún no se aplica",
      "Que aumentó el uso del transporte público",
    ],
  },
  {
    id: "en-b2-09",
    skill: "LISTENING",
    level: "B2",
    audioText: "Had we known about the delay, we would have booked a later flight.",
    stem: "¿Qué se entiende?",
    options: [
      "No sabían del retraso",
      "Sabían del retraso y cambiaron el vuelo",
      "Su vuelo fue cancelado",
      "Reservaron un vuelo más tarde",
    ],
  },
  {
    id: "en-b2-10",
    skill: "LISTENING",
    level: "B2",
    audioText: "The quarterly figures exceeded expectations, largely thanks to strong sales in Asia.",
    stem: "¿A qué se debió el buen resultado?",
    options: ["A las ventas en Asia", "A recortes de costos", "A un nuevo producto", "A la caída de la competencia"],
  },

  // ---------------- C1 ----------------
  {
    id: "en-c1-01",
    skill: "GRAMMAR",
    level: "C1",
    stem: "Not until the results were published ___ the scale of the problem.",
    options: ["did we realise", "we realised", "we did realise", "had realised we"],
  },
  { id: "en-c1-02", skill: "VOCAB", level: "C1", stem: "Her speech was so ___ that the audience was moved to tears.", options: ["poignant", "pungent", "pertinent", "punctual"] },
  { id: "en-c1-03", skill: "GRAMMAR", level: "C1", stem: "___ it not for your help, we would never have finished.", options: ["Were", "Had", "Was", "Should"] },
  {
    id: "en-c1-04",
    skill: "VOCAB",
    level: "C1",
    stem: "The CEO's remarks were deliberately ___, leaving plenty of room for interpretation.",
    options: ["ambiguous", "unanimous", "conspicuous", "meticulous"],
  },
  { id: "en-c1-05", skill: "GRAMMAR", level: "C1", stem: "I'd rather you ___ mention this to anyone.", options: ["didn't", "don't", "won't", "not"] },
  { id: "en-c1-06", skill: "VOCAB", level: "C1", stem: "The project was put on the back ___ due to budget cuts.", options: ["burner", "seat", "foot", "door"] },
  { id: "en-c1-07", skill: "VOCAB", level: "C1", stem: "His explanation was rather ___; I couldn't follow it at all.", options: ["convoluted", "concise", "lucid", "candid"] },
  {
    id: "en-c1-08",
    skill: "READING",
    level: "C1",
    passage:
      "The author contends that technological progress, far from liberating us, has merely raised the bar of what counts as productive, so that we work as hard as ever.",
    stem: "¿Cuál es la idea del autor?",
    options: [
      "La tecnología elevó las expectativas y seguimos trabajando igual",
      "La tecnología nos liberó del trabajo",
      "Hoy trabajamos menos que antes",
      "La productividad ha disminuido",
    ],
  },
  {
    id: "en-c1-09",
    skill: "LISTENING",
    level: "C1",
    audioText: "While the proposal has its merits, I'm not entirely convinced it addresses the underlying issue.",
    stem: "¿Qué actitud tiene quien habla?",
    options: ["Tiene reservas sobre la propuesta", "La apoya por completo", "La rechaza por completo", "Le es indiferente"],
  },
  {
    id: "en-c1-10",
    skill: "LISTENING",
    level: "C1",
    audioText: "Little did she know that the interview would change the course of her career.",
    stem: "¿Qué significa la frase?",
    options: [
      "Ella no imaginaba el impacto que tendría la entrevista",
      "Ella sabía que la entrevista cambiaría su carrera",
      "La entrevista fue muy corta",
      "Ella rechazó la entrevista",
    ],
  },
];
