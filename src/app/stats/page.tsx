"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { WrongAnswerStats } from "@/components/wrong-answer-stats";
import { PracticeStats } from "@/components/practice-stats";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Activity } from "lucide-react";
import { DailyMotivation } from '@/components/daily-motivation';
import { TodayStudyPlan } from '@/components/today-study-plan';
import { ExamCountdown } from '@/components/exam-countdown';

export default function StatsPage() {
    const { t, language } = useLanguage();

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <BarChart3 className="h-8 w-8" />
                        学习统计
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {t.stats?.headerDesc || "View your learning progress and data analysis"}
                    </p>
                </div>
                <DailyMotivation />
            </div>

            <ExamCountdown />
            <TodayStudyPlan />
            <Tabs defaultValue="wrong" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="wrong" className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        {t.wrongAnswerStats?.title || "Wrong Answer Stats"}
                    </TabsTrigger>
                    <TabsTrigger value="practice" className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        {t.stats?.title || "Practice Stats"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="wrong" className="space-y-4">
                    <WrongAnswerStats />
                </TabsContent>
                <TabsContent value="practice" className="space-y-4">
                    <PracticeStats />
                </TabsContent>
            </Tabs>
        </div>
    );
}
