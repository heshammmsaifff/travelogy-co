import { describe, it, expect } from "vitest";

type AgencyCreditAccount = {
  creditLimit: number;
  balance: number; // outstanding amount owed
};

function getAvailableCredit(account: AgencyCreditAccount): number {
  return Math.max(0, account.creditLimit - account.balance);
}

function canAffordBooking(account: AgencyCreditAccount, bookingTotal: number): boolean {
  return getAvailableCredit(account) >= bookingTotal;
}

function processBookingCharge(account: AgencyCreditAccount, bookingTotal: number): AgencyCreditAccount {
  if (!canAffordBooking(account, bookingTotal)) {
    throw new Error("P0001: Credit limit exceeded");
  }
  return {
    ...account,
    balance: account.balance + bookingTotal,
  };
}

function processPayment(account: AgencyCreditAccount, paymentAmount: number): AgencyCreditAccount {
  return {
    ...account,
    balance: Math.max(0, account.balance - paymentAmount),
  };
}

function processCancellationRefund(account: AgencyCreditAccount, refundAmount: number): AgencyCreditAccount {
  return {
    ...account,
    balance: Math.max(0, account.balance - refundAmount),
  };
}

describe("Credit Ledger Model & Credit Facility", () => {
  const initialAccount: AgencyCreditAccount = {
    creditLimit: 50000,
    balance: 15000,
  };

  it("calculates available credit accurately", () => {
    expect(getAvailableCredit(initialAccount)).toBe(35000);
  });

  it("permits bookings within the available credit limit", () => {
    const bookingTotal = 20000;
    expect(canAffordBooking(initialAccount, bookingTotal)).toBe(true);

    const updated = processBookingCharge(initialAccount, bookingTotal);
    expect(updated.balance).toBe(35000);
    expect(getAvailableCredit(updated)).toBe(15000);
  });

  it("strictly rejects bookings exceeding available credit with P0001", () => {
    const excessiveBooking = 40000; // only 35,000 available
    expect(canAffordBooking(initialAccount, excessiveBooking)).toBe(false);

    expect(() => processBookingCharge(initialAccount, excessiveBooking)).toThrow(
      "P0001: Credit limit exceeded",
    );
  });

  it("restores available credit upon recording an offline payment", () => {
    const accountWithDebt: AgencyCreditAccount = {
      creditLimit: 50000,
      balance: 35000,
    };

    const paymentAmount = 25000;
    const afterPayment = processPayment(accountWithDebt, paymentAmount);

    expect(afterPayment.balance).toBe(10000);
    expect(getAvailableCredit(afterPayment)).toBe(40000);
  });

  it("restores credit balance upon booking cancellation", () => {
    const beforeCancel: AgencyCreditAccount = {
      creditLimit: 50000,
      balance: 20000,
    };

    const refundAmount = 8000;
    const afterCancel = processCancellationRefund(beforeCancel, refundAmount);

    expect(afterCancel.balance).toBe(12000);
    expect(getAvailableCredit(afterCancel)).toBe(38000);
  });
});
