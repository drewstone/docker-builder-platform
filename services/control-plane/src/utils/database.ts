import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export async function initializeDatabase(prisma: PrismaClient) {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');

    const tableCount = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;

    logger.info(`Found ${tableCount[0].count} tables in database`);

    return true;
  } catch (error) {
    logger.error(error, 'Failed to initialize database');
    throw error;
  }
}