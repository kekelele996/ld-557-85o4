import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionStatus, TransactionType } from '../../constants/enums';
import { CurrentUser } from '../../types/request';
import { paginate } from '../../utils/pagination';
import { HoldingsService, ReplayTransaction } from '../holdings/holdings.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

export interface TransactionRecord {
  id: number;
  holdingId: number;
  portfolioId: number;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
  status: TransactionStatus;
  cancelledAt: string | null;
}

@Injectable()
export class TransactionsService {
  private readonly transactions: TransactionRecord[] = [
    {
      id: 1,
      holdingId: 1,
      portfolioId: 1,
      type: TransactionType.BUY,
      quantity: 10,
      price: 180,
      fee: 1,
      executedAt: new Date().toISOString(),
      status: TransactionStatus.ACTIVE,
      cancelledAt: null,
    },
  ];
  private nextId = 2;

  constructor(private readonly holdingsService: HoldingsService) {}

  /** 持仓维度的交易历史：默认返回含已撤销在内的全部记录，由 status/cancelledAt 区分 */
  listByHolding(holdingId: number, user: CurrentUser, includeCancelled = true) {
    this.holdingsService.findOwned(holdingId, user);
    return this.transactions
      .filter((item) => item.holdingId === holdingId)
      .filter((item) => includeCancelled || item.status === TransactionStatus.ACTIVE);
  }

  /** 组合维度的交易分页：默认只列有效交易，includeCancelled=true 时才包含已撤销记录 */
  listByPortfolio(portfolioId: number, user: CurrentUser, page = 1, pageSize = 20, includeCancelled = false) {
    this.holdingsService.listByPortfolio(portfolioId, user);
    const items = this.transactions
      .filter((item) => item.portfolioId === portfolioId)
      .filter((item) => includeCancelled || item.status === TransactionStatus.ACTIVE);
    return paginate(items, page, pageSize);
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
      executedAt: dto.executedAt ?? new Date().toISOString(),
      status: TransactionStatus.ACTIVE,
      cancelledAt: null,
    };
    this.transactions.push(transaction);
    this.holdingsService.applyTransaction(holdingId, dto.quantity, dto.price, dto.type, user);
    return transaction;
  }

  /**
   * 撤销一笔交易：标记 CANCELLED 后，用剩余有效交易从初始持仓重算。
   * 重算（含卖出可卖数量校验）先于落盘状态执行，失败则交易、持仓、市值全部保持原样。
   * 对已撤销记录重复撤销返回 409 冲突。
   */
  cancel(id: number, user: CurrentUser) {
    const transaction = this.findOne(id);
    this.holdingsService.findOwned(transaction.holdingId, user);

    if (transaction.status === TransactionStatus.CANCELLED) {
      throw new ConflictException('transaction already cancelled');
    }

    const replayTransactions = this.activeTransactionsForHolding(transaction.holdingId)
      .filter((item) => item.id !== id)
      .map((item): ReplayTransaction => ({ type: item.type, quantity: item.quantity, price: item.price }));

    // 先重算：若中途可卖数量不足会抛 ConflictException，此时尚未修改任何数据
    const holding = this.holdingsService.recomputeFromTransactions(transaction.holdingId, replayTransactions, user);

    transaction.status = TransactionStatus.CANCELLED;
    transaction.cancelledAt = new Date().toISOString();

    return { transaction, holding };
  }

  private findOne(id: number) {
    const transaction = this.transactions.find((item) => item.id === id);
    if (!transaction) throw new NotFoundException('transaction not found');
    return transaction;
  }

  private activeTransactionsForHolding(holdingId: number) {
    return this.transactions
      .filter((item) => item.holdingId === holdingId && item.status === TransactionStatus.ACTIVE)
      .sort((a, b) => {
        const timeDiff = new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime();
        return timeDiff !== 0 ? timeDiff : a.id - b.id;
      });
  }
}
