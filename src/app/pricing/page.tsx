"use client";

import React from 'react';
import { Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PricingPage() {
    const router = useRouter();

    const handleSubscribe = async (priceId: string) => {
        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ priceId }),
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const { url } = await response.json();
            if (url) {
                window.location.href = url;
            } else {
                console.error('No checkout URL returned');
                alert('Failed to start checkout. Please try again.');
            }
        } catch (err) {
            console.error('Subscription error:', err);
            alert('Failed to start checkout. Please try again.');
        }
    };

    const [currentTier, setCurrentTier] = React.useState<string | null>(null);
    const [loadingTier, setLoadingTier] = React.useState(true);
    const [user, setUser] = React.useState<any>(null);

    React.useEffect(() => {
        const fetchTier = async () => {
            const { createClient } = await import('@/utils/supabase/client');
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('tier')
                    .eq('id', user.id)
                    .single();
                if (profile) setCurrentTier(profile.tier);
            }
            setLoadingTier(false);
        };
        fetchTier();
    }, []);

    const getTierButtonProps = (tierName: string) => {
        const tierId = tierName.toLowerCase();
        const isCurrent = currentTier === tierId;

        if (loadingTier) return { text: "Loading...", disabled: true, className: "opacity-50 cursor-not-allowed" };

        if (isCurrent) {
            return {
                text: "Current Plan",
                disabled: true,
                className: "bg-green-600/20 text-green-400 border border-green-600/50 cursor-default hover:bg-green-600/20"
            };
        }

        // Logic for upgrade/downgrade could be complex, but for now just show "Switch" or "Go X"
        // If user is logged in but on a different plan
        return {
            text: tierId === 'free' ? "Downgrade" : (tierId === 'plus' ? "Upgrade to Plus" : "Go Ultra"),
            disabled: false,
            className: tierName === 'Plus'
                ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-white'
        };
    };

    const tiers = [
        {
            name: "Free",
            price: "$0",
            period: "/forever",
            description: "For casual users.",
            features: [
                "1 Credit per day",
                "Basic Analysis",
                "Community Support",
            ],
            notIncluded: [
                "Priority Support",
                "Deep Analysis Mode",
            ],
            action: () => { }, // Free has no checkout
            popular: false,
        },
        {
            name: "Plus",
            price: "$8",
            period: "/month",
            description: "For serious job seekers.",
            features: [
                "50 Credits per day",
                "Priority Processing",
                "Deep Analysis Mode",
                "Email Support",
            ],
            notIncluded: [],
            action: () => handleSubscribe('price_1SzjF674W6EWOdEmED7CEf7X'),
            popular: true,
        },
        {
            name: "Ultra",
            price: "$30",
            period: "/month",
            description: "For agencies & pros.",
            features: [
                "200 Credits per day",
                "Highest Priority",
                "API Access (Coming Soon)",
                "24/7 Support",
            ],
            notIncluded: [],
            action: () => handleSubscribe('price_1SzjFs74W6EWOdEmXnKba4Eu'),
            popular: false,
        },
    ];

    return (
        <div className="min-h-screen bg-black text-white relative overflow-hidden py-20 px-6">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[10%] left-[20%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]" />
                <div className="absolute bottom-[20%] right-[10%] w-[30%] h-[30%] bg-blue-900/20 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto">
                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-4">
                        Choose your weapon
                    </h1>
                    <p className="text-xl text-gray-400">
                        Unlock more power to perfect your portfolio.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {tiers.map((tier) => {
                            const buttonProps = getTierButtonProps(tier.name);

                            return (
                                <div
                                    key={tier.name}
                                    className={`relative p-8 rounded-2xl border backdrop-blur-sm flex flex-col ${tier.popular
                                        ? 'bg-white/10 border-red-500/50 shadow-2xl shadow-red-900/20 transform md:-translate-y-4'
                                        : 'bg-white/5 border-white/10'
                                        }`}
                                >
                                    {tier.popular && (
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                                            MOST POPULAR
                                        </div>
                                    )}

                                    <div className="mb-8">
                                        <h3 className="text-xl font-medium text-gray-300 mb-2">{tier.name}</h3>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-4xl font-bold text-white">{tier.price}</span>
                                            <span className="text-sm text-gray-500">{tier.period}</span>
                                        </div>
                                        <p className="text-sm text-gray-400 mt-4">{tier.description}</p>
                                    </div>

                                    <ul className="space-y-4 mb-8 flex-1">
                                        {tier.features.map((feature) => (
                                            <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                                                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                                                {feature}
                                            </li>
                                        ))}
                                        {tier.notIncluded.map((feature) => (
                                            <li key={feature} className="flex items-center gap-3 text-sm text-gray-600">
                                                <X className="w-5 h-5 flex-shrink-0" />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>

                                    <button
                                        onClick={tier.action}
                                        disabled={buttonProps.disabled}
                                        className={`w-full py-4 rounded-xl font-bold transition-all ${buttonProps.className}`}
                                    >
                                        {buttonProps.text}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            );
}
