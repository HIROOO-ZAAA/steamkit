import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const creatorId = searchParams.get('creator_id');
    const subscriberId = searchParams.get('subscriber_id');

    if (!creatorId || !subscriberId) {
      return NextResponse.json(
        { error: 'creator_id and subscriber_id required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('fan_points')
      .select('balance, total_earned, total_spent, created_at, updated_at')
      .eq('creator_id', creatorId)
      .eq('subscriber_id', subscriberId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      balance: data?.balance ?? 0,
      total_earned: data?.total_earned ?? 0,
      total_spent: data?.total_spent ?? 0,
      created_at: data?.created_at,
      updated_at: data?.updated_at,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { creator_id, subscriber_id, amount_khr, amount_usd, payment_id } = body;

    if (!creator_id || !subscriber_id || (!amount_khr && !amount_usd) || !payment_id) {
      return NextResponse.json(
        { error: 'creator_id, subscriber_id, amount_khr/amount_usd, payment_id required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('award_fan_points_on_donation', {
      p_creator_id: creator_id,
      p_subscriber_id: subscriber_id,
      p_amount_khr: amount_khr ?? 0,
      p_amount_usd: amount_usd ?? 0,
      p_payment_id: payment_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ points_awarded: data, new_balance: data });
  } catch (e) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}