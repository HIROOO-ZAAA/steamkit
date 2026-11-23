import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { publishOverlayEvent } from '@/app/api/events/route';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redeem_id, subscriber_id, input_text, input_data } = body;

    if (!redeem_id || !subscriber_id) {
      return NextResponse.json(
        { error: 'redeem_id and subscriber_id required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('spend_fan_points', {
      p_redeem_id: redeem_id,
      p_subscriber_id: subscriber_id,
      p_input_text: input_text ?? null,
      p_input_data: input_data ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Publish SSE event for overlay — non-blocking, never fails the claim
    try {
      publishOverlayEvent('redeem_trigger', data);
    } catch {
      // SSE delivery is best-effort; the claim is already committed
    }

    return NextResponse.json({
      claim: data,
      event_type: 'redeem_trigger',
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}