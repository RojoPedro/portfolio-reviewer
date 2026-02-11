
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, XCircle, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { generateReviewPDF } from '@/utils/pdfGenerator';
import clsx from 'clsx';

// Interface matching the backend JSON response
export interface ReviewData {
    review_metadata: {
        severity_applied: number;
        date: string;
    };
    scores: {
        final_score: number;
        categories: {
            hard_skills: number;
            experience_relevance: number;
            impact_results: number;
            soft_skills: number;
            formatting_ats: number;
        };
    };
    feedback_cards: Array<{
        category_name: string;
        score: number;
        short_comment: string;
        status_color: "green" | "yellow" | "red";
    }>;
    actionable_feedback: string[];
}

interface ReviewDashboardProps {
    data: ReviewData;
    cvUrl?: string | null;  // For audit link in PDF (locally it's a file, so maybe just null for now, or object URL)
    jobUrl?: string | null;
    onReset: () => void;
}

const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
    const circumference = 2 * Math.PI * 40; // r=40
    const offset = circumference - (score / 100) * circumference;

    const getColor = (s: number) => {
        if (s >= 80) return "text-green-500";
        if (s >= 50) return "text-yellow-500";
        return "text-red-500";
    };

    return (
        <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
                <circle
                    className="text-gray-700"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                    r="40"
                    cx="64"
                    cy="64"
                />
                <motion.circle
                    className={getColor(score)}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="40"
                    cx="64"
                    cy="64"
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className={clsx("text-3xl font-bold", getColor(score))}>{score}</span>
                <span className="text-xs text-gray-400">/ 100</span>
            </div>
        </div>
    );
};

const FeedbackCard: React.FC<{ item: ReviewData['feedback_cards'][0]; index: number }> = ({ item, index }) => {
    const getColor = (status: string) => {
        switch (status) {
            case 'green': return 'bg-green-500/10 border-green-500/20 text-green-400';
            case 'yellow': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400';
            case 'red': return 'bg-red-500/10 border-red-500/20 text-red-400';
            default: return 'bg-gray-800 border-gray-700 text-gray-400';
        }
    };

    const getIcon = () => {
        switch (item.status_color) {
            case 'green': return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'yellow': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
            case 'red': return <XCircle className="w-5 h-5 text-red-500" />;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={clsx("p-4 rounded-xl border flex flex-col gap-2", getColor(item.status_color))}
        >
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                    {getIcon()}
                    <h4 className="font-semibold text-white">{item.category_name}</h4>
                </div>
                <span className="font-bold text-lg">{item.score}</span>
            </div>
            <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden">
                <motion.div
                    className={clsx("h-full", {
                        'bg-green-500': item.status_color === 'green',
                        'bg-yellow-500': item.status_color === 'yellow',
                        'bg-red-500': item.status_color === 'red',
                    })}
                    initial={{ width: 0 }}
                    animate={{ width: `${item.score}%` }}
                    transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                />
            </div>
            <p className="text-sm opacity-90">{item.short_comment}</p>
        </motion.div>
    );
};

const ReviewDashboard: React.FC<ReviewDashboardProps> = ({ data, cvUrl, jobUrl, onReset }) => {

    const handleDownloadPDF = () => {
        generateReviewPDF(data, cvUrl || null, jobUrl || null);
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8 mt-12 mb-20 animate-in fade-in zoom-in duration-500">

            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
                <div className="flex items-center gap-6">
                    <ScoreGauge score={data.scores.final_score} />
                    <div>
                        <h2 className="text-2xl font-bold text-white">Analysis Complete</h2>
                        <p className="text-gray-400">Severity Level: <span className="text-red-400 font-bold">{data.review_metadata.severity_applied}/10</span></p>
                        <p className="text-sm text-gray-500">{new Date(data.review_metadata.date).toLocaleDateString()}</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        New Review
                    </button>
                    <button
                        onClick={handleDownloadPDF}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors shadow-lg shadow-red-900/20"
                    >
                        <Download className="w-4 h-4" />
                        Download Report
                    </button>
                </div>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Feedback Cards */}
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {data.feedback_cards.map((card, idx) => (
                        <FeedbackCard key={idx} item={card} index={idx} />
                    ))}
                </div>

                {/* Actionable Feedback */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="lg:col-span-1 bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl border border-white/10"
                >
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                        Top Actions
                    </h3>
                    <ul className="space-y-4">
                        {data.actionable_feedback.map((action, idx) => (
                            <li key={idx} className="flex gap-3 text-sm text-gray-300">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white border border-white/20">
                                    {idx + 1}
                                </span>
                                {action}
                            </li>
                        ))}
                    </ul>
                </motion.div>
            </div>

        </div>
    );
};

export default ReviewDashboard;
