-- Todas las sesiones de esta base en UTC (Prisma guarda DateTime en UTC sin zona horaria).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;
