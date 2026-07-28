import { serviceClient } from '@/lib/supabase-server';
import type { PaymentRow, AllocationRow } from '@/lib/ledger';
import type { PayInfo } from '@/components/StatementView';

/**
 * Everything a statement needs beyond the loan and its draws.
 *
 * Payment instructions live on the lender, but `lenders_read` is
 * staff/admin only -- a signed-in borrower cannot select from that table.
 * So the lender lookup deliberately uses the service client. Only the two
 * borrower-facing fields are ever returned; the lender's identity is not.
 */
export async function fetchStatementExtras(loanId: string): Promise<{
  payments: PaymentRow[]; allocations: AllocationRow[]; payInfo: PayInfo | null;
}> {
  const svc = serviceClient();

  const [{ data: payments }, { data: allocations }, { data: loanRow }] = await Promise.all([
    svc.from('payments').select('id, payment_date, amount, method, note')
      .eq('loan_id', loanId).order('payment_date', { ascending: true }),
    svc.from('payment_allocations').select('payment_id, period_month, amount')
      .eq('loan_id', loanId),
    svc.from('loans').select('lender_id').eq('id', loanId).maybeSingle(),
  ]);

  let payInfo: PayInfo | null = null;
  if (loanRow?.lender_id) {
    const { data: lender } = await svc.from('lenders')
      .select('payment_method, payment_instructions').eq('id', loanRow.lender_id).maybeSingle();
    if (lender && (lender.payment_method || lender.payment_instructions)) {
      payInfo = { method: lender.payment_method, instructions: lender.payment_instructions };
    }
  }

  return {
    payments: (payments ?? []) as PaymentRow[],
    allocations: (allocations ?? []) as AllocationRow[],
    payInfo,
  };
}
