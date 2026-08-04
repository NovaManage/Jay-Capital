import { type NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase-server';
import { statementPDF } from '@/lib/statement-pdf';
import { firstOfMonth, clampMonth, todayInAppTz } from '@/lib/format';
import { fetchStatementExtras } from '@/lib/statement-data';
import { logActivity, currentUserIdOrNull } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * Public statement PDF by unguessable token. Optional ?month=YYYY-MM-DD
 * (snapped to first of month). Resolves only the single loan for the token.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = serviceClient();
  const { data: loan } = await supabase.from('loan_summary').select('*').eq('access_token', params.token).maybeSingle();
  if (!loan) return new Response('Not found', { status: 404 });

  const { data: draws } = await supabase.from('draw_details').select('*').eq('loan_id', loan.loan_id).order('draw_date', { ascending: true });

  const monthParam = new URL(req.url).searchParams.get('month');
  // Clamped to the loan's own valid range: ?month= is user-supplied, and an
  // out-of-range value would render a statement for a month the loan did not
  // exist in. Defaults to the month now in progress.
  const requested = monthParam ? firstOfMonth(monthParam) : firstOfMonth(todayInAppTz(), 1);
  const statementDate = clampMonth(requested, loan.closing_date);

  const extras = await fetchStatementExtras(loan.loan_id);
  await logActivity('pdf_download', loan.loan_id, await currentUserIdOrNull());
  const pdf = await statementPDF(loan, draws ?? [], statementDate, extras);
  const displayName = loan.is_entity && loan.entity_name ? loan.entity_name : loan.borrower_name;
  const safeName = `Statement_${displayName.replace(/[^a-z0-9]+/gi, '_')}_${statementDate}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  });
}
