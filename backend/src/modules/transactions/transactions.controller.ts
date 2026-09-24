import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUserDecorator } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../types/request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('holdings/:holdingId/transactions')
  @ApiQuery({ name: 'includeCancelled', required: false, description: '是否包含已撤销记录，默认 true（交易历史返回全部，以 status 区分）' })
  byHolding(
    @Param('holdingId', ParseIntPipe) holdingId: number,
    @Query('includeCancelled') includeCancelled: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.transactionsService.listByHolding(holdingId, user, includeCancelled !== 'false');
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
  @ApiQuery({ name: 'includeCancelled', required: false, description: '是否包含已撤销记录，默认 false（组合列表不显示已撤销交易）' })
  byPortfolio(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('includeCancelled') includeCancelled: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.transactionsService.listByPortfolio(
      portfolioId,
      user,
      Number(page),
      Number(pageSize),
      includeCancelled === 'true',
    );
  }
}
