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
export async function fetchStatementExtras(loanId: string, opts: { requireUserAccess?: boolean } = {}): Promise<{
  payments: PaymentRow[]; allocations: AllocationRow[]; payInfo: PayInfo | null;
}> {
  // Defence in depth. This function reads with the service role, which
  // bypasses RLS, so when it is called on behalf of a signed-in user we first
  // re-ask the database AS THAT USER whether they may see the loan at all.
  // Callers driven by a statement token (which is itself the credential) skip
  // this; the token lookup has already pinned the result to one loan.
  if (opts.requireUserAccess) {
    const { serverClient } = await import('@/lib/supabase-server');
    const asUser = serverClient();
    const { data: allowed } = await asUser
      .from('loan_summary').select('loan_id').eq('loan_id', loanId).maybeSingle();
    if (!allowed) return { payments: [], allocations: [], payInfo: null };
  }

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
