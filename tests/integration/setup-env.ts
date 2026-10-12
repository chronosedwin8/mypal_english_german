import "dotenv/config";

// Antes de importar cualquier modulo que use la base: apuntar a mypal_test.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.TAVUS_DRIVER = "fake";
process.env.PAYMENT_DRIVER = "fake";
process.env.AI_DRIVER = "fake";
process.env.ELEVENLABS_DRIVER = "fake";
process.env.STORAGE_DRIVER = "memory";
