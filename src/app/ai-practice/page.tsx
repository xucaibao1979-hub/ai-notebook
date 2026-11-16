import { LearningWorkspace } from '@/components/learning-workspace';
import { TodayStudyPlan } from '@/components/today-study-plan';

export default function AIPracticePage() {
    return <>
        <LearningWorkspace mode="ai" />
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 md:px-8"><TodayStudyPlan /></div>
    </>;
}
