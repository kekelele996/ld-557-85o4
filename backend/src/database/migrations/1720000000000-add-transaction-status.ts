import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionStatus1720000000000 implements MigrationInterface {
  name = 'AddTransactionStatus1720000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE transaction_status AS ENUM ('ACTIVE','CANCELED')`);
    await queryRunner.query(`ALTER TABLE transactions ADD COLUMN status transaction_status NOT NULL DEFAULT 'ACTIVE', ADD COLUMN canceled_at TIMESTAMP`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE transactions DROP COLUMN IF EXISTS canceled_at, DROP COLUMN IF EXISTS status`);
    await queryRunner.query(`DROP TYPE IF EXISTS transaction_status`);
  }
}
