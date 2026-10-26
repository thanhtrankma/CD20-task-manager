import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../env';
import { PrismaClient } from '../generated/prisma/client';

/** Prisma 7 kết nối CSDL qua driver adapter (node-postgres). */
const pgAdapter = () => new PrismaPg({ connectionString: env.databaseUrl });

/** Dùng ngoài Nest (script seed). */
export const createPrismaClient = () => new PrismaClient({ adapter: pgAdapter() });

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: pgAdapter() });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
