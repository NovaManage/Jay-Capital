import { type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase-server';
import { statementPDF } from '@/lib/statement-pdf';
import { fetchStatementExtras } from '@/lib/statement-data';
import { logActivity } from '@/lib/activity';
import { firstOfMonth, clampMonth, todayInAppTz } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * Statement PDF for a loan the SIGNED-IN user is allowed to see.
 *
 * Replaces the old /api/statement-pdf/[token] route. That one took an
 * unguessable token, which meant anyone who was forwarded the link could pull
 * the statement, and every download was anonymous. The loan is now read with
 * the user's own client, so row level security decides access and the download
 * is attributable.
 */
export async function GET(req: NextRequest, { params }: { params: { loanId: string } }) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  // RLS: a borrower only sees their own loans, staff and admin see all.
  const { data: loan } = await supabase
    .from('loan_summary').select('*').eq('loan_id', params.loanId).maybeSingle();
  if (!loan) return new Response('Not found', { status: 404 });

  const { data: draws } = await supabase
    .from('draw_details').select('*').eq('loan_id', loan.loan_id).order('draw_date', { ascending: true });

  const monthParam = new URL(req.url).searchParams.get('month');
  const requested = monthParam ? firstOfMonth(monthParam) : firstOfMonth(todayInAppTz(), 1);
  const statementDate = clampMonth(requested, loan.closing_date);

  const extras = await fetchStatementExtras(loan.loan_id, { requireUserAccess: true });
  await logActivity('pdf_download', loan.loan_id, user.id,
    `Statement ${statementDate} · ${loan.loan_number} · ${loan.property}`);

  const pdf = await statementPDF(loan, draws ?? [], statementDate, extras);
  const displayName = loan.is_entity && loan.entity_name ? loan.entity_name : loan.borrower_name;
  const safeName = `Statement_${displayName.replace(/[^a-z0-9]+/gi, '_')}_${statementDate}.pdf`;

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
