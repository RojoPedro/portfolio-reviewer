
"use client";

import React, { useState, useEffect } from "react";
// import Header from "@/components/Header"; 
import ReviewForm from "@/components/ReviewForm";
import ReviewDashboard, { ReviewData } from "@/components/ReviewDashboard";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import InstallPrompt from "@/components/InstallPrompt";

export default function Home() {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jobUrl, setJobUrl] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? "");
        const { data: profile } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', user.id)
          .single();
        if (profile) setCredits(profile.credits);
      }
    };
    fetchUser();
  }, [supabase]);

  const handleReviewSubmit = async (data: FormData) => {
    if (credits !== null && credits < 1) {
      alert("Insufficient credits. Please contact support to top up.");
      return;
    }

    setIsLoading(true);
    setReviewData(null);
    setCvFile(data.get('portfolio') as File);
    setJobUrl(data.get('jobOfferUrl') as string);

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        body: data,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || "Failed to fetch review");
      }

      const result: ReviewData = await response.json();
      setReviewData(result);

      // Update credits locally
      setCredits(prev => (prev !== null ? prev - 1 : null));

    } catch (error) {
      console.error("Error fetching review:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Something went wrong"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setReviewData(null);
    setCvFile(null);
    setJobUrl(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-red-900/20 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-orange-900/20 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10">

        {/* Simplified Header with Auth Info */}
        <header className="container mx-auto px-6 py-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-orange-500">
              Portfolio Reviewer
            </span>
          </div>

          <div className="flex items-center gap-4">
            {credits !== null && (
              <div className="bg-white/10 px-3 py-1 rounded-full border border-white/10 text-sm font-medium">
                Credits: <span className={credits > 0 ? "text-green-400" : "text-red-500"}>{credits}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <User className="w-4 h-4" />
              <span className="hidden md:inline">{userEmail}</span>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>


        <main className="container mx-auto px-6 py-8">
          {!reviewData ? (
            <>
              <div className="text-center mb-12 space-y-4">
                <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">
                  Is your portfolio ready for the real world?
                </h2>
                <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                  Get an honest, sometimes brutal, AI-powered critique.
                  Upload your portfolio and (optional) job offer to see if you have what it takes.
                </p>
              </div>
              <ReviewForm onSubmit={handleReviewSubmit} isLoading={isLoading} />
            </>
          ) : (
            <ReviewDashboard
              data={reviewData}
              cvUrl={cvFile ? URL.createObjectURL(cvFile) : null}
              jobUrl={jobUrl}
              onReset={handleReset}
            />
          )}
        </main>
      </div>
    </div>
  );
}
