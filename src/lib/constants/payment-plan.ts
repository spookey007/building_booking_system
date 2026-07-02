export const MAX_INSTALLMENTS = 60;
export const MIN_INSTALLMENTS = 1;

export function assertInstallmentCount(count: number) {
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
    throw new Error(`Installment count must be between ${MIN_INSTALLMENTS} and ${MAX_INSTALLMENTS}.`);
  }
}
