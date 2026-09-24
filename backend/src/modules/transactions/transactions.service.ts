import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TransactionStatus, TransactionType } from '../../constants/enums';
import { CurrentUser } from '../../types/request';
import { paginate } from '../../utils/pagination';
import { HoldingRecord, HoldingsService } from '../holdings/holdings.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

export interface TransactionRecord {
  id: number;
  holdingId: number;
  portfolioId: number;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  status: TransactionStatus;
  executedAt: string;
  canceledAt: string | null;
}

export type TransactionStatusFilter = 'active' | 'canceled' | 'all';

const EPSILON = 1e-9;

@Injectable()
export class TransactionsService {
  private readonly transactions: TransactionRecord[] = [
    { id: 1, holdingId: 1, portfolioId: 1, type: TransactionType.BUY, quantity: 10, price: 180, fee: 1, status: TransactionStatus.ACTIVE, executedAt: new Date().toISOString(), canceledAt: null },
  ];
  private nextId = 2;

  constructor(private readonly holdingsService: HoldingsService) {}

  listByHolding(holdingId: number, user: CurrentUser, status: TransactionStatusFilter = 'active') {
    this.holdingsService.findOwned(holdingId, user);
    return this.transactions.filter((item) => item.holdingId === holdingId && this.matchesStatus(item, status));
  }

  listByPortfolio(portfolioId: number, user: CurrentUser, page = 1, pageSize = 20, status: TransactionStatusFilter = 'active') {
    this.holdingsService.listByPortfolio(portfolioId, user);
    return paginate(this.transactions.filter((item) => item.portfolioId === portfolioId && this.matchesStatus(item, status)), page, pageSize);
  }

  create(holdingId: number, dto: CreateTransactionDto, user: CurrentUser) {
    const holding = this.holdingsService.findOwned(holdingId, user);
    const transaction: TransactionRecord = {
      id: this.nextId++,
      holdingId,
      portfolioId: holding.portfolioId,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
      fee: dto.fee ?? 0,
      status: TransactionStatus.ACTIVE,
      executedAt: dto.executedAt ?? new Date().toISOString(),
      canceledAt: null,
    };
    this.transactions.push(transaction);
    this.holdingsService.applyTransaction(holdingId, dto.quantity, dto.price, dto.type, user);
    return transaction;
  }

  cancel(id: number, user: CurrentUser) {
    const transaction = this.transactions.find((item) => item.id === id);
    if (!transaction) throw new NotFoundException('transaction not found');
    const holding = this.holdingsService.findOwned(transaction.holdingId, user);
    if (transaction.status === TransactionStatus.CANCELED) {
      throw new ConflictException('transaction already canceled');
    }

    const remaining = this.transactions
      .filter((item) => item.holdingId === transaction.holdingId && item.status === TransactionStatus.ACTIVE && item.id !== transaction.id)
      .sort((a, b) => a.executedAt.localeCompare(b.executedAt) || a.id - b.id);

    // 先从初始持仓干跑重算：可卖数量不足则抛错，交易、持仓、市值均不变
    const recalculated = this.replayFromInitial(holding, remaining);

    transaction.status = TransactionStatus.CANCELED;
    transaction.canceledAt = new Date().toISOString();
    this.holdingsService.applyRecalculated(holding.id, recalculated.quantity, recalculated.avgCost);
    return transaction;
  }

  private replayFromInitial(holding: HoldingRecord, transactions: TransactionRecord[]) {
    let quantity = holding.initialQuantity;
    let avgCost = holding.initialAvgCost;
    for (const item of transactions) {
      if (item.type === TransactionType.BUY) {
        const newQuantity = quantity + item.quantity;
        avgCost = newQuantity === 0 ? 0 : ((avgCost * quantity) + (item.price * item.quantity)) / newQuantity;
        quantity = newQuantity;
      }
      if (item.type === TransactionType.SELL) {
        if (item.quantity > quantity + EPSILON) {
          throw new UnprocessableEntityException('insufficient sellable quantity after recalculation, cancel rejected');
        }
        quantity = Math.max(0, quantity - item.quantity);
      }
    }
    return { quantity: Number(quantity.toFixed(6)), avgCost: Number(avgCost.toFixed(4)) };
  }

  private matchesStatus(item: TransactionRecord, status: TransactionStatusFilter) {
    if (status === 'all') return true;
    if (status === 'canceled') return item.status === TransactionStatus.CANCELED;
    return item.status === TransactionStatus.ACTIVE;
  }
}
