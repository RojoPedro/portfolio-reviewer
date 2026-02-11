
"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Briefcase, FileText, Flame, UploadCloud } from 'lucide-react';
import clsx from 'clsx';

interface ReviewFormProps {
    onSubmit: (data: FormData) => Promise<void>;
    isLoading: boolean;
}

const ReviewForm: React.FC<ReviewFormProps> = ({ onSubmit, isLoading }) => {
    const [portfolioFile, setPortfolioFile] = useState<File | null>(null);
    const [jobOfferUrl, setJobOfferUrl] = useState('');
    const [severity, setSeverity] = useState(5);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!portfolioFile) return;

        const formData = new FormData();
        formData.append('portfolio', portfolioFile);
        if (jobOfferUrl) formData.append('jobOfferUrl', jobOfferUrl);
        formData.append('ruthlessness', severity.toString()); // Keeping key 'ruthlessness' for backend compat or changing backend? Backend expects 'ruthlessness' in my previous edit. Yes I used 'ruthlessness' in backend formData.get.

        onSubmit(formData);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setPortfolioFile(e.target.files[0]);
        }
    };

    const getSeverityLabel = (value: number) => {
        if (value <= 3) return "Coach Mode";
        if (value <= 7) return "Recruiter Mode";
        return "ATS / Hard Mode";
    };

    const getSeverityColor = (value: number) => {
        if (value <= 3) return "text-green-400";
        if (value <= 7) return "text-blue-400";
        return "text-red-500";
    };

    const getSeverityDescription = (value: number) => {
        if (value <= 3) return "Encouraging, focuses on potential.";
        if (value <= 7) return "Standard market evaluation.";
        return "Brutal, algorithmic accuracy.";
    };

    return (
        <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl mx-auto space-y-6 bg-white/5 p-8 rounded-2xl border border-white/10 backdrop-blur-sm"
            onSubmit={handleSubmit}
        >

            <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <FileText className="w-4 h-4" />
                    Portfolio PDF <span className="text-red-500">*</span>
                </label>
                <div className="relative group cursor-pointer">
                    <input
                        type="file"
                        accept="application/pdf"
                        required
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className={clsx(
                        "w-full bg-black/50 border border-dashed rounded-lg px-4 py-8 text-center transition-all group-hover:border-red-500/50 flex flex-col items-center justify-center gap-2",
                        portfolioFile ? "border-red-500/50 bg-red-900/10" : "border-white/10"
                    )}>
                        {portfolioFile ? (
                            <>
                                <FileText className="w-8 h-8 text-red-500" />
                                <span className="text-white font-medium">{portfolioFile.name}</span>
                                <span className="text-xs text-gray-400">{(portfolioFile.size / 1024 / 1024).toFixed(2)} MB</span>
                            </>
                        ) : (
                            <>
                                <UploadCloud className="w-8 h-8 text-gray-500 group-hover:text-red-400 transition-colors" />
                                <span className="text-gray-400">Click to upload or drag and drop your PDF CV/Portfolio</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <Briefcase className="w-4 h-4" />
                    Job Offer URL <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                    type="url"
                    placeholder="https://linkedin.com/jobs/..."
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                    value={jobOfferUrl}
                    onChange={(e) => setJobOfferUrl(e.target.value)}
                />
            </div>

            <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                        <Flame className="w-4 h-4 text-orange-500" />
                        Severity Level
                    </label>
                    <div className="text-right">
                        <span className={clsx("font-bold block", getSeverityColor(severity))}>
                            {getSeverityLabel(severity)} ({severity}/10)
                        </span>
                        <span className="text-xs text-gray-500">
                            {getSeverityDescription(severity)}
                        </span>
                    </div>

                </div>
                <input
                    type="range"
                    min="0"
                    max="10"
                    value={severity}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setSeverity(val < 1 ? 1 : val);
                    }}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-red-500 bg-gray-700"
                    style={{
                        background: `linear-gradient(to right, #ef4444 ${(severity / 10) * 100}%, #374151 ${(severity / 10) * 100}%)`
                    }}
                />
                <div className="flex justify-between text-xs text-gray-600 px-1">
                    <span>Coach</span>
                    <span>Recruiter</span>
                    <span>ATS/Hard</span>
                </div>
            </div>

            <button
                type="submit"
                disabled={isLoading || !portfolioFile}
                className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg shadow-red-900/20"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analyzing...
                    </>
                ) : (
                    <>
                        <Search className="w-5 h-5" />
                        Analyze Portfolio
                    </>
                )}
            </button>
        </motion.form>
    );
};

export default ReviewForm;

