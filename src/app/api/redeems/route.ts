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
    const status = searchParams.get('status') ?? 'active';

    if (!creatorId) {
      return NextResponse.json(
        { error: 'creator_id required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('redeems')
      .select('*')
      .eq('creator_id', creatorId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ redeems: data ?? [] });
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
    const { creator_id, title, description, type, cost, cooldown_seconds, max_per_stream, max_per_user_per_stream, config } = body;

    if (!creator_id || !title || !cost) {
      return NextResponse.json(
        { error: 'creator_id, title, cost required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('redeems')
      .insert({
        creator_id,
        title,
        description,
        type: type ?? 'text',
        cost,
        cooldown_seconds: cooldown_seconds ?? 0,
        max_per_stream,
        max_per_user_per_stream,
        config: config ?? {},
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ redeem: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}