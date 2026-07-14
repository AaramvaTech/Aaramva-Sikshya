import { IsUUID } from 'class-validator';

export class ListDeliveriesQueryDto {
  // GET /credential-deliveries?userId=<uuid> — the account whose ledger to read.
  @IsUUID()
  userId!: string;
}
