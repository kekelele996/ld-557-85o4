import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUserDecorator } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../types/request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionsService, TransactionStatusFilter } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('holdings/:holdingId/transactions')
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'canceled', 'all'], description: '默认 active，只返回有效交易' })
  byHolding(
    @Param('holdingId', ParseIntPipe) holdingId: number,
    @Query('status') status: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.transactionsService.listByHolding(holdingId, user, this.parseStatus(status));
  }

  @Post('holdings/:holdingId/transactions')
  create(@Param('holdingId', ParseIntPipe) holdingId: number, @Body() dto: CreateTransactionDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.transactionsService.create(holdingId, dto, user);
  }

  @Post('transactions/:id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUserDecorator() user: CurrentUser) {
    return this.transactionsService.cancel(id, user);
  }

  @Get('portfolios/:portfolioId/transactions')
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'canceled', 'all'], description: '默认 active，只返回有效交易' })
  byPortfolio(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('status') status: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.transactionsService.listByPortfolio(portfolioId, user, Number(page), Number(pageSize), this.parseStatus(status));
  }

  private parseStatus(status: string): TransactionStatusFilter {
    if (status === 'canceled' || status === 'all') return status;
    return 'active';
  }
}
