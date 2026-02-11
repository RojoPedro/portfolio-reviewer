import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-01-28.clover' as any,
});

// You should set this env var to verify webhooks signature!
// For local testing without CLI, we might skip signature check IF explicitly allowed, 
// but best practice is to require it.
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature') as string;

    let event: Stripe.Event;

    try {
        if (webhookSecret && signature) {
            event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        } else {
            // Fallback for local testing without proper CLI forwarding/secret
            // WARNING: INSECURE. ONLY FOR DEV.
            if (process.env.NODE_ENV === 'development') {
                console.warn("Skipping Webhook Signature verification (Dev Mode)");
                event = JSON.parse(body);
            } else {
                throw new Error("Missing webhook secret");
            }
        }
    } catch (err: any) {
        console.error(`Webhook signature verification failed.`, err.message);
        return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId) {
            // Determine Tier based on Amount or Price ID lookup
            // Simplification: We look at the amount_total or we query the subscription
            // For now, let's just assume we can map price IDs, or we fetch the line items.
            // Actually, easy hack: metadata could carry the tier. But we didn't add it in checkout route.
            // Let's query the subscription to get the price ID.

            let tier = 'free';
            let dailyLimit = 1;

            // Retrieve subscription to check the plan
            if (subscriptionId) {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const priceId = subscription.items.data[0].price.id;

                if (priceId === 'price_1SzjF674W6EWOdEmED7CEf7X') { // Plus
                    tier = 'plus';
                    dailyLimit = 50;
                } else if (priceId === 'price_1SzjFs74W6EWOdEmXnKba4Eu') { // Ultra
                    tier = 'ultra';
                    dailyLimit = 200;
                }
            }

            // Update Profile
            const { error } = await supabase
                .from('profiles')
                .update({
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                    tier: tier,
                    daily_credits_limit: dailyLimit,
                    credits: dailyLimit // Instant refill on upgrade
                })
                .eq('id', userId);

            if (error) console.error('Error updating profile:', error);
            else console.log(`User ${userId} upgraded to ${tier}`);
        }
    }

    return NextResponse.json({ received: true });
}
