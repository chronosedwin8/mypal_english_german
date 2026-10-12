/**
 * Areas tematicas para variar el banco. El generador elige una al azar y evita los
 * temas usados hace poco. Son ideas de dominio, no contenido de examen.
 */
import type { BankKind } from "./types";

export const TOPIC_DOMAINS: Record<Exclude<BankKind, "writingTask" | "speakingTask">, string[]> = {
  reading: [
    "marine biology", "archaeology", "urban planning", "history of technology", "cognitive psychology",
    "materials science", "linguistics", "agriculture and food security", "renewable energy", "astronomy",
    "animal behaviour", "economics of transport", "architecture", "medicine history", "ecology of forests",
    "water management", "anthropology", "climate science", "sports science", "education research",
    "geology", "botany", "museum studies", "information technology history", "nutrition science",
  ],
  listening: [
    "booking accommodation", "joining a sports club", "a community festival", "a museum tour", "renting equipment",
    "a library orientation", "a university field trip", "a group research project", "a lecture on wildlife conservation",
    "a lecture on the history of a material", "a lecture on human memory", "a volunteer programme", "a local transport change",
    "a cooking course enquiry", "a job enquiry at a hotel", "a talk about a new park", "a seminar on marketing",
    "a lecture on coastal erosion", "a tutorial about a dissertation", "a lecture on ancient trade routes",
  ],
  writing1: [
    "energy consumption by source", "household spending categories", "transport use in cities", "water use by sector",
    "tourist arrivals by region", "university enrolments by subject", "waste recycling rates", "internet usage by age group",
    "food production over time", "employment by industry", "average temperatures and rainfall", "library visits over time",
  ],
  writing2: [
    "education and technology", "work and leisure", "environment and individual responsibility", "health and government",
    "cities and housing", "media and advertising", "travel and tourism", "crime and punishment", "science funding",
    "globalisation and culture", "family and ageing", "sport and society", "transport and pollution", "art and public money",
  ],
  speaking1: [
    "hometown", "work or studies", "accommodation", "music", "weather", "reading", "public transport", "cooking",
    "shopping", "sport", "friends", "holidays", "technology", "photographs", "the internet", "plants", "time management",
  ],
  speaking2: [
    "a memorable journey", "a useful skill", "a person who helped you", "a place you would like to visit", "an important decision",
    "a book or film", "a piece of technology", "a celebration", "a building you like", "a time you were very busy",
    "a teacher who influenced you", "a hobby", "a gift", "a café or restaurant", "a goal you have",
  ],
};

/** Temas para los examenes de aleman (Goethe, TestDaF): vida cotidiana, trabajo, estudio y sociedad. */
export const TOPIC_DOMAINS_DE: Record<"reading" | "listening" | "writingTask" | "speakingTask", string[]> = {
  reading: [
    "Arbeitswelt und Homeoffice", "Wohnen in der Stadt", "Umwelt und Klimaschutz", "Ernährung und Gesundheit", "Freizeit und Ehrenamt",
    "Bildung und Weiterbildung", "Digitalisierung im Alltag", "Mobilität und Verkehr", "Kultur und Museen", "Wissenschaft und Forschung",
    "Tourismus", "Sport im Verein", "Konsum und Nachhaltigkeit", "Familie und Generationen", "Medien und Nachrichten",
  ],
  listening: [
    "Durchsagen am Bahnhof", "Radiointerview mit einer Expertin", "Gespräch unter Kollegen", "Vortrag an der Volkshochschule",
    "Diskussion über Stadtplanung", "Telefonnachricht beim Arzt", "Führung durch ein Museum", "Podcast über Ernährung",
    "Seminar an der Universität", "Beratung im Studentenwerk", "Gespräch auf dem Wochenmarkt", "Vorlesung über Klimaforschung",
  ],
  writingTask: [
    "Homeoffice", "Ehrenamt", "Plastikmüll", "soziale Medien", "Sprachenlernen", "Wohnungssuche", "Kurse an der Volkshochschule",
    "Arbeitszeiten", "Tourismus in Städten", "Online-Unterricht", "Fahrradstadt", "Lebensmittelverschwendung",
  ],
  speakingTask: [
    "ein Fest planen", "Freizeitangebote", "Studium im Ausland", "Rauchverbot", "Fahrverbote in Innenstädten", "Haustiere",
    "Kunst im öffentlichen Raum", "Teilzeitarbeit", "Smartphones in der Schule", "regionale Produkte", "Mehrsprachigkeit",
  ],
};
