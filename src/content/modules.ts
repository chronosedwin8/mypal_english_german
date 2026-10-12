/**
 * Curriculo conversacional. Cada leccion trae:
 *  - objetivos (en español, para el estudiante),
 *  - vocabulario clave (en el idioma meta),
 *  - tutorBrief: instrucciones EN INGLES que recibe el tutor en conversational_context.
 */
import type { CefrLevel } from "./diagnostic/types";

export interface LessonDef {
  slug: string;
  titleEs: string;
  objectives: string[];
  targetVocab: string[];
  tutorBrief: string;
  usesVision?: boolean;
  suggestedMinutes: number;
}

export interface ModuleDef {
  slug: string;
  lang: "EN" | "DE";
  audience?: "ADULT" | "KIDS";
  level: CefrLevel;
  emoji: string;
  titleEs: string;
  descriptionEs: string;
  lessons: LessonDef[];
}

export const MODULES: ModuleDef[] = [
  // ============================== INGLES ==============================
  {
    slug: "primeros-pasos",
    lang: "EN",
    level: "A1",
    emoji: "👋",
    titleEs: "Primeros pasos",
    descriptionEs: "Presentarte, hablar de ti y de tu familia.",
    lessons: [
      {
        slug: "presentate",
        titleEs: "Preséntate",
        objectives: ["Decir tu nombre, edad y de dónde eres", "Preguntar lo mismo al tutor"],
        targetVocab: ["name", "from", "years old", "live", "work", "study"],
        tutorBrief:
          "Goal: the student introduces themselves. Ask one simple question at a time: name, country, city, job or studies, age if they want. Model short answers ('I'm from Bogotá. I'm a nurse.'). Recycle the target vocabulary. Keep sentences under 8 words.",
        suggestedMinutes: 5,
      },
      {
        slug: "mi-familia",
        titleEs: "Mi familia",
        objectives: ["Hablar de los miembros de tu familia", "Usar have/has y adjetivos simples"],
        targetVocab: ["mother", "father", "brother", "sister", "children", "tall", "funny"],
        tutorBrief:
          "Goal: describe family members. Ask who is in their family, names, ages and one adjective for each. If they show a photo to the camera, describe it together. Gently correct have/has.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "mi-casa",
    lang: "EN",
    level: "A1",
    emoji: "🏠",
    titleEs: "Describe tu casa",
    descriptionEs: "Objetos, muebles y lugares de tu casa, usando tu cámara.",
    lessons: [
      {
        slug: "que-ves",
        titleEs: "¿Qué hay en tu cuarto?",
        objectives: ["Nombrar objetos de tu entorno", "Usar there is / there are"],
        targetVocab: ["chair", "table", "lamp", "window", "bed", "there is", "there are"],
        tutorBrief:
          "VISION LESSON. Ask the student to slowly show their room with the camera. Name the objects you can see, ask 'What's this?' and have the student repeat. Practise 'There is a… / There are two…'. Save new words with save_vocabulary.",
        usesVision: true,
        suggestedMinutes: 8,
      },
      {
        slug: "colores-y-formas",
        titleEs: "Colores y tamaños",
        objectives: ["Describir objetos por color y tamaño"],
        targetVocab: ["red", "blue", "green", "big", "small", "round", "square"],
        tutorBrief:
          "VISION LESSON. Ask the student to hold up objects one by one. Ask about colour, size and shape ('It's a small blue mug'). Play a quick game: you describe an object you can see and they guess it.",
        usesVision: true,
        suggestedMinutes: 6,
      },
    ],
  },
  {
    slug: "restaurante",
    lang: "EN",
    level: "A1",
    emoji: "🍽️",
    titleEs: "En el restaurante",
    descriptionEs: "Pedir comida y bebida con cortesía.",
    lessons: [
      {
        slug: "pedir",
        titleEs: "Pide tu comida",
        objectives: ["Pedir comida y bebida", "Usar I'd like / Can I have"],
        targetVocab: ["menu", "I'd like", "can I have", "the bill", "water", "starter", "main course"],
        tutorBrief:
          "Role-play: you are a friendly waiter, the student is a customer. Offer the menu, take their order, suggest a drink, and finish with the bill. Encourage polite forms (I'd like…, Could I have…).",
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "small-talk",
    lang: "EN",
    level: "A2",
    emoji: "☕",
    titleEs: "Small talk",
    descriptionEs: "Conversaciones cortas y naturales con cualquiera.",
    lessons: [
      {
        slug: "fin-de-semana",
        titleEs: "¿Qué hiciste el fin de semana?",
        objectives: ["Contar actividades en pasado", "Hacer preguntas de seguimiento"],
        targetVocab: ["went", "watched", "had", "relaxing", "busy", "How was…?"],
        tutorBrief:
          "Goal: past simple in small talk. Ask about their weekend, react naturally ('Oh, nice!'), ask follow-up questions and encourage them to ask you back. Recast irregular past forms when wrong.",
        suggestedMinutes: 8,
      },
      {
        slug: "el-clima",
        titleEs: "Hablar del clima",
        objectives: ["Comentar el clima y hacer planes"],
        targetVocab: ["sunny", "rainy", "cloudy", "forecast", "it's going to"],
        tutorBrief:
          "Talk about the weather where the student lives versus where you 'are'. Introduce 'going to' for plans depending on the weather. If they can see a window, ask them to describe what they see outside.",
        usesVision: true,
        suggestedMinutes: 6,
      },
    ],
  },
  {
    slug: "viajes",
    lang: "EN",
    level: "A2",
    emoji: "✈️",
    titleEs: "Aeropuerto y viajes",
    descriptionEs: "Check-in, controles, hotel e indicaciones.",
    lessons: [
      {
        slug: "check-in",
        titleEs: "En el aeropuerto",
        objectives: ["Hacer el check-in", "Responder preguntas en migración"],
        targetVocab: ["boarding pass", "luggage", "gate", "window seat", "purpose of your visit"],
        tutorBrief:
          "Role-play: you are an airline agent, then an immigration officer. Ask for passport, luggage, seat preference, and the purpose and length of the trip. Keep a realistic but kind tone.",
        suggestedMinutes: 10,
      },
      {
        slug: "direcciones",
        titleEs: "Pedir indicaciones",
        objectives: ["Pedir y entender direcciones"],
        targetVocab: ["turn left", "go straight on", "next to", "opposite", "how far"],
        tutorBrief:
          "Role-play: the student is a tourist asking for directions to places (museum, station, pharmacy). Give clear directions and check understanding by asking them to repeat the route.",
        suggestedMinutes: 6,
      },
    ],
  },
  {
    slug: "compras",
    lang: "EN",
    level: "A2",
    emoji: "🛍️",
    titleEs: "De compras",
    descriptionEs: "Tallas, precios, devoluciones… con objetos reales.",
    lessons: [
      {
        slug: "en-la-tienda",
        titleEs: "En la tienda de ropa",
        objectives: ["Preguntar tallas y precios", "Describir ropa"],
        targetVocab: ["size", "try on", "fitting room", "how much", "too big", "receipt"],
        tutorBrief:
          "VISION + role-play: ask the student to show a piece of clothing they have and describe it (colour, material). Then role-play buying it in a shop: size, price, try on, pay. Note US/UK differences (sweater/jumper, pants/trousers) according to the variant.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "salud",
    lang: "EN",
    level: "B1",
    emoji: "🩺",
    titleEs: "En el médico",
    descriptionEs: "Explicar síntomas y entender recomendaciones.",
    lessons: [
      {
        slug: "sintomas",
        titleEs: "Explica tus síntomas",
        objectives: ["Describir síntomas", "Entender indicaciones"],
        targetVocab: ["headache", "sore throat", "fever", "prescription", "since yesterday", "should"],
        tutorBrief:
          "Role-play: you are a GP (UK) or doctor (US). Ask about symptoms, how long they have had them, and give advice with 'should/shouldn't'. Check they understood the instructions.",
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "entrevista",
    lang: "EN",
    level: "B1",
    emoji: "💼",
    titleEs: "Entrevista de trabajo",
    descriptionEs: "Habla de tu experiencia con seguridad.",
    lessons: [
      {
        slug: "cuentame-de-ti",
        titleEs: "Tell me about yourself",
        objectives: ["Presentar tu experiencia", "Hablar de fortalezas"],
        targetVocab: ["experience", "responsible for", "strengths", "achieved", "team"],
        tutorBrief:
          "Role-play a friendly job interview. Ask: tell me about yourself, your current role, a challenge you solved, strengths and weaknesses. After each answer give one tip to sound more natural.",
        suggestedMinutes: 12,
      },
      {
        slug: "preguntas-dificiles",
        titleEs: "Preguntas difíciles",
        objectives: ["Responder con el método STAR"],
        targetVocab: ["situation", "task", "action", "result", "deadline", "conflict"],
        tutorBrief:
          "Practise behavioural questions using the STAR method. Ask one question, let them answer, then help them restructure the answer in STAR form. Push for past tenses and concrete results.",
        suggestedMinutes: 12,
      },
    ],
  },
  {
    slug: "reuniones",
    lang: "EN",
    level: "B2",
    emoji: "📊",
    titleEs: "Reuniones de trabajo",
    descriptionEs: "Opinar, interrumpir con cortesía y negociar.",
    lessons: [
      {
        slug: "dar-opinion",
        titleEs: "Da tu opinión",
        objectives: ["Expresar acuerdo y desacuerdo con matices"],
        targetVocab: ["I see your point, but", "to be honest", "on the other hand", "I'd suggest"],
        tutorBrief:
          "Simulate a team meeting about a realistic decision (e.g. switching to a 4-day week). Take a position and challenge the student politely so they must agree, disagree and propose alternatives using hedging language.",
        suggestedMinutes: 12,
      },
    ],
  },

  // ============================== ALEMAN ==============================
  {
    slug: "erste-schritte",
    lang: "DE",
    level: "A1",
    emoji: "👋",
    titleEs: "Primeros pasos",
    descriptionEs: "Presentarte y hablar de tu familia en alemán.",
    lessons: [
      {
        slug: "vorstellen",
        titleEs: "Preséntate",
        objectives: ["Decir tu nombre, origen y profesión", "Usar du y Sie"],
        targetVocab: ["Ich heiße", "Ich komme aus", "Ich wohne in", "Ich bin … von Beruf"],
        tutorBrief:
          "Goal: the student introduces themselves in German. Ask one simple question at a time (Wie heißt du? Woher kommst du? Was machst du beruflich?). Model short answers. Briefly explain du vs Sie when relevant, in Spanish if they are A1.",
        suggestedMinutes: 5,
      },
      {
        slug: "familie",
        titleEs: "Meine Familie",
        objectives: ["Hablar de la familia", "Usar mein/meine"],
        targetVocab: ["die Mutter", "der Vater", "der Bruder", "die Schwester", "die Kinder"],
        tutorBrief:
          "Goal: describe family with mein/meine. Ask who is in their family and one detail about each. If they show a photo, describe it together. Always give nouns with their article.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "zuhause",
    lang: "DE",
    level: "A1",
    emoji: "🏠",
    titleEs: "Describe tu casa",
    descriptionEs: "Der, die, das con los objetos de tu cuarto.",
    lessons: [
      {
        slug: "was-ist-das",
        titleEs: "Was ist das?",
        objectives: ["Nombrar objetos con su artículo", "Usar Das ist / Da ist"],
        targetVocab: ["der Stuhl", "der Tisch", "die Lampe", "das Fenster", "das Bett"],
        tutorBrief:
          "VISION LESSON. Ask the student to show their room. For every object you see, say it WITH its article and plural (der Stuhl, die Stühle). Use colours: die Lampe ist gelb. Save words with save_vocabulary including the article.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "im-cafe",
    lang: "DE",
    level: "A1",
    emoji: "🥐",
    titleEs: "En la panadería y el café",
    descriptionEs: "Pedir con cortesía: Ich hätte gern…",
    lessons: [
      {
        slug: "bestellen",
        titleEs: "Bestellen",
        objectives: ["Pedir comida y bebida", "Preguntar el precio y pagar"],
        targetVocab: ["Ich hätte gern", "Was kostet", "die Rechnung", "zum Mitnehmen", "das Brötchen"],
        tutorBrief:
          "Role-play: you work in a Bäckerei/Café. Greet, take the order, ask 'Zum Mitnehmen oder hier?', give the price and say goodbye. Encourage 'Ich hätte gern…' and 'Ich möchte…'.",
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "alltag",
    lang: "DE",
    level: "A2",
    emoji: "📅",
    titleEs: "Mi día a día",
    descriptionEs: "Rutinas, horas y el Perfekt.",
    lessons: [
      {
        slug: "wochenende",
        titleEs: "Was hast du am Wochenende gemacht?",
        objectives: ["Contar en Perfekt", "Usar haben/sein correctamente"],
        targetVocab: ["ich bin gefahren", "ich habe gegessen", "gestern", "am Samstag"],
        tutorBrief:
          "Goal: Perfekt in small talk. Ask about their weekend; recast errors with haben/sein and participle position. Ask follow-up questions and invite them to ask you back.",
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "reisen",
    lang: "DE",
    level: "A2",
    emoji: "🚆",
    titleEs: "Viajar por Alemania",
    descriptionEs: "Tren, hotel y direcciones.",
    lessons: [
      {
        slug: "bahnhof",
        titleEs: "Am Bahnhof",
        objectives: ["Comprar un billete", "Entender anuncios"],
        targetVocab: ["die Fahrkarte", "das Gleis", "umsteigen", "die Verspätung", "hin und zurück"],
        tutorBrief:
          "Role-play at a Deutsche Bahn counter: the student buys a ticket (destination, time, one-way or return, seat reservation). Add a small delay announcement and check they understood.",
        suggestedMinutes: 10,
      },
    ],
  },
  {
    slug: "einkaufen",
    lang: "DE",
    level: "A2",
    emoji: "🛍️",
    titleEs: "De compras",
    descriptionEs: "Ropa, tallas y colores con tus propias cosas.",
    lessons: [
      {
        slug: "kleidung",
        titleEs: "Kleidung",
        objectives: ["Describir ropa con adjetivos", "Preguntar por tallas"],
        targetVocab: ["der Pullover", "die Hose", "die Größe", "anprobieren", "zu groß"],
        tutorBrief:
          "VISION + role-play: ask the student to show a piece of clothing and describe it (colour, material). Then role-play buying it. Focus gently on adjective endings without overloading A2 learners.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "arbeit",
    lang: "DE",
    level: "B1",
    emoji: "💼",
    titleEs: "Trabajo en Alemania",
    descriptionEs: "Entrevistas y conversaciones en la oficina.",
    lessons: [
      {
        slug: "vorstellungsgespraech",
        titleEs: "Vorstellungsgespräch",
        objectives: ["Hablar de tu experiencia profesional", "Usar el Sie formal"],
        targetVocab: ["die Erfahrung", "zuständig für", "die Stärke", "das Team", "die Bewerbung"],
        tutorBrief:
          "Role-play a German job interview using 'Sie'. Ask about experience, responsibilities, strengths and why they want to work in Germany. After each answer, give one tip on word order (verb in second/last position).",
        suggestedMinutes: 12,
      },
    ],
  },
  {
    slug: "meinung",
    lang: "DE",
    level: "B2",
    emoji: "🗣️",
    titleEs: "Opinar y debatir",
    descriptionEs: "Argumentar con conectores y matices.",
    lessons: [
      {
        slug: "diskussion",
        titleEs: "Eine Diskussion",
        objectives: ["Defender una opinión", "Usar conectores (einerseits… andererseits)"],
        targetVocab: ["meiner Meinung nach", "einerseits", "andererseits", "dagegen", "ich bin überzeugt"],
        tutorBrief:
          "Debate a current topic (e.g. 4-Tage-Woche, Homeoffice). Take the opposite position and push the student to argue with connectors and subordinate clauses. Recast case and word-order errors.",
        suggestedMinutes: 12,
      },
    ],
  },
];

/** Curriculo infantil (Nuez, la ardilla): juegos cortos con la camara. */
export const KIDS_MODULES: ModuleDef[] = [
  {
    slug: "ninos-colores",
    lang: "EN",
    audience: "KIDS",
    level: "A1",
    emoji: "🎨",
    titleEs: "Colores y formas",
    descriptionEs: "Muéstrale tus juguetes a Nuez y aprende los colores.",
    lessons: [
      {
        slug: "veo-veo",
        titleEs: "Veo veo (I spy)",
        objectives: ["Decir colores en inglés", "Jugar a adivinar objetos"],
        targetVocab: ["red", "blue", "yellow", "green", "I spy", "circle", "square"],
        tutorBrief: "VISION GAME. Play 'I spy with my little eye something red' using objects you can see. Let the child guess or show the object. Then swap roles. Celebrate every answer.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "ninos-animales",
    lang: "EN",
    audience: "KIDS",
    level: "A1",
    emoji: "🐶",
    titleEs: "Animales",
    descriptionEs: "Sonidos, nombres y peluches.",
    lessons: [
      {
        slug: "sonidos",
        titleEs: "¿Qué animal hace…?",
        objectives: ["Nombrar animales", "Imitar sus sonidos"],
        targetVocab: ["dog", "cat", "cow", "bird", "lion", "fish"],
        tutorBrief: "Make animal sounds and ask the child to guess the animal in English. If they have stuffed animals or toys, ask them to show them and name them together.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "ninos-numeros",
    lang: "EN",
    audience: "KIDS",
    level: "A1",
    emoji: "🔢",
    titleEs: "Números con los dedos",
    descriptionEs: "Contar del 1 al 10 jugando.",
    lessons: [
      {
        slug: "contar",
        titleEs: "Cuenta conmigo",
        objectives: ["Contar del 1 al 10", "Mostrar números con los dedos"],
        targetVocab: ["one", "two", "three", "four", "five", "how many?"],
        tutorBrief: "Count to ten together. Ask the child to show numbers with their fingers to the camera and say them. Count objects you can see (pencils, toys).",
        usesVision: true,
        suggestedMinutes: 6,
      },
    ],
  },
  {
    slug: "ninos-comida",
    lang: "EN",
    audience: "KIDS",
    level: "A1",
    emoji: "🍎",
    titleEs: "Frutas y comida",
    descriptionEs: "Lo que me gusta y lo que no.",
    lessons: [
      {
        slug: "me-gusta",
        titleEs: "I like apples!",
        objectives: ["Nombrar frutas", "Decir lo que te gusta"],
        targetVocab: ["apple", "banana", "orange", "I like", "I don't like", "yummy"],
        tutorBrief: "Talk about favourite fruits and food with 'I like...'. If the child shows a fruit or snack to the camera, name it together and ask its colour.",
        usesVision: true,
        suggestedMinutes: 6,
      },
    ],
  },
  {
    slug: "kinder-farben",
    lang: "DE",
    audience: "KIDS",
    level: "A1",
    emoji: "🎨",
    titleEs: "Colores en alemán",
    descriptionEs: "Rot, blau, gelb… con tus juguetes.",
    lessons: [
      {
        slug: "ich-sehe",
        titleEs: "Ich sehe was, was du nicht siehst",
        objectives: ["Decir colores en alemán", "Jugar al veo veo"],
        targetVocab: ["rot", "blau", "gelb", "grün", "der Ball", "das Spielzeug"],
        tutorBrief: "VISION GAME in German: play 'Ich sehe was, was du nicht siehst, und das ist rot!' with objects you can see. Always say nouns with their article.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
  {
    slug: "kinder-tiere",
    lang: "DE",
    audience: "KIDS",
    level: "A1",
    emoji: "🐱",
    titleEs: "Animales en alemán",
    descriptionEs: "Der Hund, die Katze… y sus sonidos.",
    lessons: [
      {
        slug: "tiere",
        titleEs: "Welches Tier ist das?",
        objectives: ["Nombrar animales con su artículo"],
        targetVocab: ["der Hund", "die Katze", "die Kuh", "der Vogel", "der Fisch"],
        tutorBrief: "Make animal sounds and let the child guess the animal in German. Name stuffed animals they show, always with the article.",
        usesVision: true,
        suggestedMinutes: 8,
      },
    ],
  },
];

/**
 * Examinador con avatar (opcional, se activa en Configuracion): el tutor en video hace de
 * examinador. Usa los minutos del tutor; la nota es informal (la oficial-estimada sale del
 * Speaking por voz, que se califica con criterios).
 */
export const EXAMINER_MODULE_PREFIX = "examen-";

const EXAMINER_RULES =
  "EXAMINER MODE: for this class you are a certified examiner, not a tutor. Stay in role until the test ends: neutral, friendly and brief; do not correct, teach or praise during the test; never answer the questions for the candidate; if they ask what a word means, rephrase the question once. Keep to the timing below. Do not comment on what you see on camera. When the test is over (or one minute before the class ends), step out of the role and, IN SPANISH, give an informal estimate per criterion with one concrete tip each, and say clearly that it is an informal estimate, not an official result.";

export const EXAMINER_MODULES: ModuleDef[] = [
  {
    slug: "examen-ielts-speaking",
    lang: "EN",
    level: "B2",
    emoji: "🎓",
    titleEs: "Examen: IELTS Speaking con examinador en video",
    descriptionEs: "Simulacro cara a cara del Speaking de IELTS con Poly como examinadora.",
    lessons: [
      {
        slug: "completo",
        titleEs: "IELTS Speaking completo (Partes 1, 2 y 3)",
        objectives: ["Responder como en el examen real, sin ayudas", "Recibir una banda informal por criterio"],
        targetVocab: [],
        tutorBrief: `${EXAMINER_RULES} IELTS Speaking, 11–14 minutes. Part 1 (4–5 min): introduce yourself, ask the candidate's name, then 8–10 short questions on two or three familiar topics (home, work or studies, hobbies). Part 2 (3–4 min): read out a cue card topic with three prompts ("You should say..."), give exactly one minute to prepare in silence, then ask them to speak for one to two minutes and stop them at two minutes; ask one short rounding-off question. Part 3 (4–5 min): a two-way discussion of abstract questions linked to the Part 2 topic, with follow-ups ("Why do you think...?"). Criteria for the final estimate: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation (bands 1–9 in half bands).`,
        suggestedMinutes: 14,
      },
      {
        slug: "partes-2-3",
        titleEs: "IELTS Speaking: Partes 2 y 3",
        objectives: ["Hablar dos minutos con la tarjeta", "Discutir ideas abstractas con ejemplos"],
        targetVocab: [],
        tutorBrief: `${EXAMINER_RULES} IELTS Speaking Parts 2 and 3 only (about 9 minutes). Part 2: read a cue card topic with three prompts, give one minute to prepare in silence, then let them speak for up to two minutes. Part 3: four to five minutes of abstract discussion linked to the topic, with follow-ups. Criteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation.`,
        suggestedMinutes: 9,
      },
    ],
  },
  {
    slug: "examen-goethe-sprechen",
    lang: "DE",
    level: "B2",
    emoji: "🎓",
    titleEs: "Examen: Sprechen con examinadora en video",
    descriptionEs: "Simulacro cara a cara del Sprechen del Goethe-Zertifikat y de TestDaF.",
    lessons: [
      {
        slug: "goethe-b2",
        titleEs: "Goethe B2 Sprechen (Vortrag y Diskussion)",
        objectives: ["Presentar un tema con estructura", "Discutir y negociar con argumentos"],
        targetVocab: [],
        tutorBrief: `${EXAMINER_RULES} Goethe-Zertifikat B2 Sprechen, in German, about 15 minutes. You play both the examiner (Prüferin) and the other candidate. Teil 1 Vortrag (about 4 min): give the candidate a topic with two options and the structure to follow (introduce the topic, describe one or two options with pros and cons, give your opinion, conclude); one minute to prepare, then let them present; afterwards ask one question about the presentation, as the partner would. Teil 2 Diskussion (about 5 min): discuss a controversial everyday question with the candidate as their partner; disagree politely, ask for reasons, and react to their arguments. Criteria for the final estimate: Erfüllung, Kohärenz, Wortschatz, Strukturen, Aussprache (A–E).`,
        suggestedMinutes: 15,
      },
      {
        slug: "goethe-b1",
        titleEs: "Goethe B1 Sprechen (planificar y presentar)",
        objectives: ["Planificar algo juntos", "Presentar un tema y responder preguntas"],
        targetVocab: [],
        tutorBrief: `${EXAMINER_RULES} Goethe-Zertifikat B1 Sprechen, in German, about 14 minutes. You play both the examiner and the partner. Teil 1 (about 3 min): plan something together (e.g. a farewell party for a colleague) with four points to agree on. Teil 2 (about 4 min): the candidate presents a topic in five steps (introduce, personal experience, situation in their country, pros and cons with opinion, conclusion and thanks). Teil 3 (about 2 min): ask one or two questions about the presentation and react as the partner. Criteria: Erfüllung, Kohärenz, Wortschatz, Strukturen, Aussprache.`,
        suggestedMinutes: 14,
      },
      {
        slug: "testdaf",
        titleEs: "TestDaF Sprechen (tareas académicas)",
        objectives: ["Describir gráficos y procesos", "Dar recomendaciones y argumentar en contexto universitario"],
        targetVocab: [],
        tutorBrief: `${EXAMINER_RULES} TestDaF Sprechen, in German, about 12 minutes, university settings. Give four short tasks one at a time, each with a brief silent preparation time (30–60 seconds) and a speaking time of one to two minutes: (1) ask a fellow student for information about a course, (2) describe a chart you describe in words (e.g. how students finance their studies), (3) give advice and weigh options for a friend's study decision, (4) argue for or against a university policy and justify your position. Criteria: overall impression, task completion and language (TDN 3, 4 or 5).`,
        suggestedMinutes: 12,
      },
    ],
  },
];
