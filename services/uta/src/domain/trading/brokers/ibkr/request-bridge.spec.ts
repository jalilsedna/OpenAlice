import { describe, it, expect, vi } from 'vitest'
import Decimal from 'decimal.js'
import { Contract, Order, OrderState } from '@traderalice/ibkr'
import { RequestBridge } from './request-bridge.js'

function stk(conId: number, symbol: string): Contract {
  const c = new Contract()
  c.conId = conId
  c.symbol = symbol
  c.secType = 'STK'
  c.currency = 'USD'
  return c
}

function cashFx(symbol: string, currency: string): Contract {
  const c = new Contract()
  c.symbol = symbol
  c.secType = 'CASH'
  c.currency = currency
  c.localSymbol = `${symbol}.${currency}`
  return c
}

function inactive(rejectReason = '', warningText = ''): OrderState {
  const os = new OrderState()
  os.status = 'Inactive'
  os.rejectReason = rejectReason
  os.warningText = warningText
  return os
}

function pushUpdate(b: RequestBridge, contract: Contract, qty: number, avgCost = '100'): void {
  b.updatePortfolio(contract, new Decimal(qty), '101', String(qty * 101), avgCost, '1', '0', 'DU1')
}

describe('RequestBridge — error routing', () => {
  it('routes 10xxx errors into the pending request (no silent timeout)', async () => {
    // Regression: `errorCode >= 2000` swallowed 10089 (market data needs
    // subscription) — the snapshot promise timed out with zero context
    // instead of carrying the venue's actionable message.
    const b = new RequestBridge()
    const promise = b.requestSnapshot(9001, 5000)
    b.error(9001, 0, 10089, 'Requested market data requires additional subscription for API.')
    await expect(promise).rejects.toThrow(/subscription/)
  })

  it('still ignores 21xx farm-status noise', () => {
    const b = new RequestBridge()
    // no pending request — must simply not throw
    expect(() => b.error(-1, 0, 2104, 'Market data farm connection is OK')).not.toThrow()
  })
})

describe('RequestBridge — connect handshake', () => {
  it('rejects waitForConnect (not unhandled) when the socket closes mid-handshake', async () => {
    // Regression: a close during the handshake calls connectionClosed() →
    // connectReject() while client.connect() is still suspended in
    // waitForHandshake(). The old code only attached a handler to the connect
    // promise AFTER `await client.connect()`, so the rejection escaped as an
    // unhandled rejection and crashed the UTA process (Railway: no TWS/Gateway
    // reachable → guardian cascade shutdown).
    const b = new RequestBridge()
    // connect() that never settles — mirrors being stuck in waitForHandshake.
    const fakeClient = { connect: () => new Promise<void>(() => {}) } as unknown as Parameters<typeof b.waitForConnect>[0]

    const p = b.waitForConnect(fakeClient, '127.0.0.1', 7497, 0, 60_000)
    const assertion = expect(p).rejects.toThrow(/closed during handshake/)
    // Socket dies before the handshake completes.
    b.connectionClosed()
    await assertion
  })
})

describe('RequestBridge — order reject observability', () => {
  it('carries the venue rejectReason on the placeOrder result', async () => {
    // A rejected FX order arrives via openOrder with status Inactive and the
    // cause on orderState.rejectReason — that reason must reach the resolved
    // CollectedOpenOrder (→ placeOrder result → TradingGit lifts it), not be
    // flattened to a bare "Inactive".
    const b = new RequestBridge()
    const orderId = 7
    const promise = b.requestOrder(orderId, 5000)
    const os = inactive(
      'Order rejected - reason: forex trading is not allowed for this account',
      'Outside RTH',
    )
    b.openOrder(orderId, cashFx('EUR', 'USD'), new Order(), os)

    const resolved = await promise
    expect(resolved.orderState.status).toBe('Inactive')
    expect(resolved.orderState.rejectReason).toContain('forex trading is not allowed')
    expect(resolved.orderState.warningText).toBe('Outside RTH')
  })

  it('logs an order reject (status + reason) at warn level', () => {
    const b = new RequestBridge()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const orderId = 8
      const promise = b.requestOrder(orderId, 5000)
      b.openOrder(orderId, cashFx('EUR', 'USD'), new Order(),
        inactive('Order rejected - reason: forex trading is not allowed for this account'))
      void promise.catch(() => {})

      expect(warn).toHaveBeenCalledTimes(1)
      const line = warn.mock.calls[0]![0] as string
      expect(line).toContain('order 8 Inactive')
      expect(line).toContain('EUR.USD')
      expect(line).toContain('forex trading is not allowed')
    } finally {
      warn.mockRestore()
    }
  })

  it('does not log a clean Submitted order at warn level', () => {
    const b = new RequestBridge()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const orderId = 9
      const promise = b.requestOrder(orderId, 5000)
      const os = new OrderState()
      os.status = 'Submitted'
      b.openOrder(orderId, stk(123, 'AAPL'), new Order(), os)
      void promise.catch(() => {})

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('surfaces a venue order error that arrives after the order resolved', () => {
    // openOrder-first ordering: the Inactive openOrder already resolved the
    // request, so the trailing error() has no pending request to reject —
    // it must still be logged, not silently swallowed.
    const b = new RequestBridge()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const orderId = 10
      // No pending request (already resolved by an earlier openOrder).
      b.error(orderId, 0, 201, 'Order rejected - reason: forex trading is not allowed for this account')

      expect(warn).toHaveBeenCalledTimes(1)
      const line = warn.mock.calls[0]![0] as string
      expect(line).toContain('order 10 rejected by venue (201)')
      expect(line).toContain('forex trading is not allowed')
    } finally {
      warn.mockRestore()
    }
  })

  it('does not treat a data-request error (reqId ≥ 10000) as an order reject', () => {
    const b = new RequestBridge()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // reqId in the data-request range with no pending request — must NOT be
      // logged as an order reject.
      b.error(10_500, 0, 200, 'No security definition has been found')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

/**
 * TWS account-subscription semantics: full download bursts end with
 * accountDownloadEnd; between bursts TWS pushes DELTAS with no end marker
 * (a fill updates one position immediately; the next full download can be
 * ~3 minutes away). The cache used to apply deltas only at the next swap —
 * the ledger said filled while the portfolio surface showed the old
 * quantity for minutes (found live, IBKR round, S8).
 */
describe('RequestBridge — account cache delta semantics', () => {
  function readyBridge(): RequestBridge {
    const b = new RequestBridge()
    ;(b as unknown as { accountCachePending_: unknown }).accountCachePending_ = { positions: [], values: new Map() }
    pushUpdate(b, stk(1, 'AAPL'), 10)
    pushUpdate(b, stk(2, 'TSLA'), 5)
    b.updateAccountValue('TotalCashValue', '1000', 'USD', 'DU1')
    b.accountDownloadEnd('DU1')
    return b
  }

  it('applies a delta update to the live cache immediately (no downloadEnd needed)', () => {
    const b = readyBridge()
    pushUpdate(b, stk(1, 'AAPL'), 9)

    const cache = b.getAccountCache()!
    const aapl = cache.positions.find((p) => p.contract.conId === 1)!
    expect(aapl.quantity.toNumber()).toBe(9)
    expect(cache.positions).toHaveLength(2)
  })

  it('removes a fully-closed position (zero quantity) immediately', () => {
    const b = readyBridge()
    pushUpdate(b, stk(2, 'TSLA'), 0)

    const cache = b.getAccountCache()!
    expect(cache.positions.map((p) => p.contract.conId)).toEqual([1])
  })

  it('applies account-value deltas to the live cache immediately', () => {
    const b = readyBridge()
    b.updateAccountValue('TotalCashValue', '900', 'USD', 'DU1')
    expect(b.getAccountCache()!.values.get('TotalCashValue')).toBe('900')
  })

  it('repeated updates within one batch window do not duplicate rows', () => {
    const b = readyBridge()
    // price-tick churn: same position updated 3x before the next downloadEnd
    pushUpdate(b, stk(1, 'AAPL'), 9)
    pushUpdate(b, stk(1, 'AAPL'), 9)
    pushUpdate(b, stk(2, 'TSLA'), 5)
    b.accountDownloadEnd('DU1')

    const cache = b.getAccountCache()!
    expect(cache.positions).toHaveLength(2)
    expect(cache.positions.find((p) => p.contract.conId === 1)!.quantity.toNumber()).toBe(9)
  })

  it('full-download swap does not resurrect a position closed mid-window', () => {
    const b = readyBridge()
    pushUpdate(b, stk(2, 'TSLA'), 0)        // closed via delta
    pushUpdate(b, stk(1, 'AAPL'), 10)       // next full burst: only AAPL remains
    b.accountDownloadEnd('DU1')

    expect(b.getAccountCache()!.positions.map((p) => p.contract.conId)).toEqual([1])
  })
})

describe('RequestBridge — currency-aware account values (issue #295)', () => {
  function readyBridge(): RequestBridge {
    const b = new RequestBridge()
    ;(b as unknown as { accountCachePending_: unknown }).accountCachePending_ = { positions: [], values: new Map() }
    b.accountDownloadEnd('DU1')
    return b
  }

  it('BASE wins the plain key regardless of arrival order', () => {
    const b = readyBridge()
    b.updateAccountValue('CashBalance', '1036370', 'BASE', 'DU1')
    b.updateAccountValue('CashBalance', '-51005', 'HKD', 'DU1')   // arrives after BASE
    const v = b.getAccountCache()!.values
    expect(v.get('CashBalance')).toBe('1036370')                   // not clobbered
    expect(v.get('CashBalance:HKD')).toBe('-51005')
    expect(v.get('CashBalance:BASE')).toBe('1036370')
  })

  it('BASE arriving late still reclaims the plain key', () => {
    const b = readyBridge()
    b.updateAccountValue('CashBalance', '-51005', 'HKD', 'DU1')    // HKD first
    const v = b.getAccountCache()!.values
    expect(v.get('CashBalance')).toBe('-51005')                    // provisional
    b.updateAccountValue('CashBalance', '1036370', 'BASE', 'DU1')
    expect(v.get('CashBalance')).toBe('1036370')                   // corrected
  })

  it('single-send tags (one currency line, no BASE) keep the plain key', () => {
    const b = readyBridge()
    b.updateAccountValue('NetLiquidation', '1046101.70', 'USD', 'DU1')
    expect(b.getAccountCache()!.values.get('NetLiquidation')).toBe('1046101.70')
    expect(b.getAccountCache()!.values.get('ExchangeRate:USD')).toBeUndefined()
  })
})
