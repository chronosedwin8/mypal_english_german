/**
 * Objetos que reconoce el modelo COCO-SSD (en el navegador) y como se dicen.
 * "person" se omite a proposito: Poly no comenta a las personas, solo objetos.
 */
export type DemoLang = "us" | "uk" | "de";

export const VISION_WORDS: Record<string, { es: string; us: string; uk: string; de: string }> = {
  cup: { es: "taza", us: "mug", uk: "mug", de: "die Tasse" },
  bottle: { es: "botella", us: "bottle", uk: "bottle", de: "die Flasche" },
  "wine glass": { es: "copa", us: "wine glass", uk: "wine glass", de: "das Weinglas" },
  fork: { es: "tenedor", us: "fork", uk: "fork", de: "die Gabel" },
  knife: { es: "cuchillo", us: "knife", uk: "knife", de: "das Messer" },
  spoon: { es: "cuchara", us: "spoon", uk: "spoon", de: "der Löffel" },
  bowl: { es: "tazón", us: "bowl", uk: "bowl", de: "die Schüssel" },
  banana: { es: "banano", us: "banana", uk: "banana", de: "die Banane" },
  apple: { es: "manzana", us: "apple", uk: "apple", de: "der Apfel" },
  orange: { es: "naranja", us: "orange", uk: "orange", de: "die Orange" },
  sandwich: { es: "sándwich", us: "sandwich", uk: "sandwich", de: "das Sandwich" },
  carrot: { es: "zanahoria", us: "carrot", uk: "carrot", de: "die Karotte" },
  broccoli: { es: "brócoli", us: "broccoli", uk: "broccoli", de: "der Brokkoli" },
  donut: { es: "dona", us: "donut", uk: "doughnut", de: "der Donut" },
  cake: { es: "pastel", us: "cake", uk: "cake", de: "der Kuchen" },
  pizza: { es: "pizza", us: "pizza", uk: "pizza", de: "die Pizza" },
  chair: { es: "silla", us: "chair", uk: "chair", de: "der Stuhl" },
  couch: { es: "sofá", us: "couch", uk: "sofa", de: "das Sofa" },
  "potted plant": { es: "planta", us: "plant", uk: "plant", de: "die Pflanze" },
  bed: { es: "cama", us: "bed", uk: "bed", de: "das Bett" },
  "dining table": { es: "mesa", us: "table", uk: "table", de: "der Tisch" },
  tv: { es: "televisor", us: "TV", uk: "telly", de: "der Fernseher" },
  laptop: { es: "portátil", us: "laptop", uk: "laptop", de: "der Laptop" },
  mouse: { es: "ratón", us: "mouse", uk: "mouse", de: "die Maus" },
  remote: { es: "control remoto", us: "remote", uk: "remote control", de: "die Fernbedienung" },
  keyboard: { es: "teclado", us: "keyboard", uk: "keyboard", de: "die Tastatur" },
  "cell phone": { es: "celular", us: "cell phone", uk: "mobile phone", de: "das Handy" },
  book: { es: "libro", us: "book", uk: "book", de: "das Buch" },
  clock: { es: "reloj", us: "clock", uk: "clock", de: "die Uhr" },
  vase: { es: "florero", us: "vase", uk: "vase", de: "die Vase" },
  scissors: { es: "tijeras", us: "scissors", uk: "scissors", de: "die Schere" },
  "teddy bear": { es: "osito de peluche", us: "teddy bear", uk: "teddy bear", de: "der Teddybär" },
  toothbrush: { es: "cepillo de dientes", us: "toothbrush", uk: "toothbrush", de: "die Zahnbürste" },
  backpack: { es: "mochila", us: "backpack", uk: "rucksack", de: "der Rucksack" },
  umbrella: { es: "paraguas", us: "umbrella", uk: "umbrella", de: "der Regenschirm" },
  handbag: { es: "bolso", us: "purse", uk: "handbag", de: "die Handtasche" },
  tie: { es: "corbata", us: "tie", uk: "tie", de: "die Krawatte" },
  "sports ball": { es: "pelota", us: "ball", uk: "ball", de: "der Ball" },
  dog: { es: "perro", us: "dog", uk: "dog", de: "der Hund" },
  cat: { es: "gato", us: "cat", uk: "cat", de: "die Katze" },
  bird: { es: "pájaro", us: "bird", uk: "bird", de: "der Vogel" },
  refrigerator: { es: "nevera", us: "fridge", uk: "fridge", de: "der Kühlschrank" },
  microwave: { es: "microondas", us: "microwave", uk: "microwave", de: "die Mikrowelle" },
  sink: { es: "lavaplatos", us: "sink", uk: "sink", de: "die Spüle" },
};

export const POLY_LINES: Record<DemoLang, { intro: { text: string; es: string }[]; react: (w: string) => string; noObject: string }> = {
  us: {
    intro: [
      { text: "Hi! I'm Poly. Great to meet you!", es: "¡Hola! Soy Poly. ¡Qué gusto conocerte!" },
      { text: "Show me something from your room and ask me what it is.", es: "Muéstrame algo de tu cuarto y pregúntame qué es." },
      { text: "I'll help you say it like a native. Ready?", es: "Te ayudo a decirlo como un nativo. ¿Listo?" },
    ],
    react: (w) => `Oh, that's a ${w}! Can you say “${w}”?`,
    noObject: "I can see you! Now hold up an object: a cup, a book, your phone…",
  },
  uk: {
    intro: [
      { text: "Hello! I'm Poly. Lovely to meet you!", es: "¡Hola! Soy Poly. ¡Encantada de conocerte!" },
      { text: "Show me something from your room and ask me what it is.", es: "Muéstrame algo de tu cuarto y pregúntame qué es." },
      { text: "I'll help you say it just like a Brit. Shall we?", es: "Te ayudo a decirlo como un británico. ¿Empezamos?" },
    ],
    react: (w) => `Ooh, that's a ${w}! Say it with me: “${w}”.`,
    noObject: "I can see you! Go on, hold up an object: a mug, a book, your mobile…",
  },
  de: {
    intro: [
      { text: "Hallo! Ich bin Poly. Schön, dich kennenzulernen!", es: "¡Hola! Soy Poly. ¡Qué gusto conocerte!" },
      { text: "Zeig mir etwas aus deinem Zimmer und frag mich, was das ist.", es: "Muéstrame algo de tu cuarto y pregúntame qué es." },
      { text: "Ich helfe dir, es wie ein Muttersprachler zu sagen.", es: "Te ayudo a decirlo como un nativo." },
    ],
    react: (w) => `Schau mal: ${w}! Sag es mit mir: „${w}“.`,
    noObject: "Ich sehe dich! Zeig mir einen Gegenstand: eine Tasse, ein Buch, dein Handy…",
  },
};
