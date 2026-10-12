-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('ADULT', 'KIDS');

-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "audience" "Audience" NOT NULL DEFAULT 'ADULT';

-- AlterTable
ALTER TABLE "TavusPal" DROP CONSTRAINT "TavusPal_pkey",
ADD COLUMN     "audience" "Audience" NOT NULL DEFAULT 'ADULT',
ADD CONSTRAINT "TavusPal_pkey" PRIMARY KEY ("variant", "audience");

-- AlterTable
ALTER TABLE "TutorSession" ADD COLUMN     "audience" "Audience" NOT NULL DEFAULT 'ADULT';

